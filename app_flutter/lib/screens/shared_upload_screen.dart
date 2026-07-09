import 'dart:io';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/connectivity_service.dart';
import '../services/upload_queue.dart';
import '../widgets/logo.dart';

/// A dónde enviar la factura compartida. Para un cliente es su negocio (se
/// asigna directo, como la cámara, y así la ve al instante en su lista). Para un
/// contador es el despacho sin asignar: el OCR la clasifica por el RNC.
class _Dest {
  _Dest({required this.orgId, this.clientProfileId, required this.label});
  final String orgId;
  final String? clientProfileId;
  final String label;
}

/// Recibe fotos compartidas (Share Extension) y las sube. Muestra un preview y
/// un botón "Subir"; al tocarlo, encola la subida y vuelve a la lista, donde la
/// factura se ve subiendo/procesando con su loader (igual que al tomar la foto).
class SharedUploadScreen extends StatefulWidget {
  const SharedUploadScreen({super.key, required this.photos});

  final List<File> photos;

  @override
  State<SharedUploadScreen> createState() => _SharedUploadScreenState();
}

class _SharedUploadScreenState extends State<SharedUploadScreen> {
  List<_Dest> _dests = [];
  _Dest? _selected;
  String? _error;
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!ApiClient.instance.hasSession) {
      setState(() {
        _error = 'Inicia sesión para subir la factura compartida.';
        _loading = false;
      });
      return;
    }
    try {
      final me = Me.fromJson(
        await ApiClient.instance.get('/api/me') as Map<String, dynamic>,
      );
      final dests = <_Dest>[
        // Negocios propios (cliente): se asignan directo → se ven al instante.
        for (final c in me.clientProfiles)
          _Dest(orgId: c.organizationId, clientProfileId: c.id, label: c.razonSocial),
        // Despachos (contador): sin asignar, el OCR clasifica por el RNC.
        for (final m in me.contadorMemberships)
          _Dest(orgId: m.orgId, clientProfileId: null, label: m.orgNombre),
      ];
      if (!mounted) return;
      if (dests.isEmpty) {
        setState(() {
          _error = 'Tu cuenta no tiene ninguna empresa donde subir facturas.';
          _loading = false;
        });
        return;
      }
      setState(() {
        _dests = dests;
        _selected = dests.first;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudo cargar tu cuenta';
          _loading = false;
        });
      }
    }
  }

  Future<void> _upload() async {
    final dest = _selected;
    if (_submitting || dest == null || widget.photos.isEmpty) return;
    setState(() => _submitting = true);
    await UploadQueue.instance.enqueue(
      orgId: dest.orgId,
      clientProfileId: dest.clientProfileId,
      images: List.of(widget.photos),
    );
    if (!mounted) return;
    // Volver a la lista (raíz) y avisar; ahí se ve la factura subiendo.
    final messenger = ScaffoldMessenger.of(context);
    final online = ConnectivityService.instance.online.value;
    Navigator.of(context).popUntil((route) => route.isFirst);
    messenger.showSnackBar(
      SnackBar(
        content: Text(online
            ? 'Factura recibida — la verás procesarse aquí mismo'
            : 'Sin conexión: guardada como pendiente, se subirá al reconectar'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Logo(size: 22)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_error != null) ...[
                        Text(_error!, style: const TextStyle(color: Colors.red)),
                        const SizedBox(height: 12),
                      ],
                      Text('Factura a subir',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 12),
                      _preview(),
                      // Solo si hay varios destinos posibles (varios negocios o
                      // despachos): elegir a cuál. Con uno solo, no se pregunta.
                      if (_error == null && _dests.length > 1) ...[
                        const SizedBox(height: 24),
                        Text('¿A dónde la enviamos?',
                            style: Theme.of(context).textTheme.titleSmall),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<_Dest>(
                          initialValue: _selected,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            prefixIcon: Icon(Icons.storefront_outlined),
                          ),
                          items: [
                            for (final d in _dests)
                              DropdownMenuItem(value: d, child: Text(d.label)),
                          ],
                          onChanged: _submitting
                              ? null
                              : (d) => setState(() => _selected = d),
                        ),
                      ],
                    ],
                  ),
                ),
                if (_error == null)
                  SafeArea(
                    minimum: const EdgeInsets.all(16),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _submitting ? null : _upload,
                        icon: _submitting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.cloud_upload_outlined),
                        label: Text(_submitting ? 'Subiendo…' : 'Subir factura'),
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          backgroundColor: scheme.primary,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _preview() {
    if (widget.photos.isEmpty) return const SizedBox.shrink();
    if (widget.photos.length == 1) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.file(widget.photos.first,
            width: double.infinity, height: 340, fit: BoxFit.cover),
      );
    }
    return SizedBox(
      height: 220,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: widget.photos.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) => ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.file(widget.photos[i],
              width: 165, height: 220, fit: BoxFit.cover),
        ),
      ),
    );
  }
}
