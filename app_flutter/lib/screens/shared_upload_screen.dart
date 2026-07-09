import 'dart:io';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/connectivity_service.dart';
import '../services/upload_queue.dart';
import '../widgets/logo.dart';

/// Un despacho (organización) al que se puede subir. La factura del share SIEMPRE
/// entra SIN asignar: el worker la clasifica al cliente correcto por el RNC del
/// comprador. Aquí solo elegimos el despacho cuando el usuario pertenece a varios.
class _Org {
  _Org(this.orgId, this.nombre);
  final String orgId;
  final String nombre;
}

/// Recibe fotos compartidas (Share Extension) y las sube SIN elegir cliente: la
/// factura entra sin asignar y el worker la asigna sola por el RNC del comprador.
/// Muestra un preview y un botón "Subir"; al tocarlo, encola y vuelve a la lista,
/// donde se ve subiendo/procesando (igual que al tomar la foto).
class SharedUploadScreen extends StatefulWidget {
  const SharedUploadScreen({super.key, required this.photos});

  final List<File> photos;

  @override
  State<SharedUploadScreen> createState() => _SharedUploadScreenState();
}

class _SharedUploadScreenState extends State<SharedUploadScreen> {
  List<_Org> _orgs = [];
  _Org? _selected;
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
      // Despachos donde puede subir (como cliente por sus negocios, o como
      // contador). Únicos por org: NO listamos clientes, la subida va sin asignar.
      final porId = <String, _Org>{};
      for (final c in me.clientProfiles) {
        porId[c.organizationId] = _Org(c.organizationId, c.organizationNombre);
      }
      for (final m in me.contadorMemberships) {
        porId[m.orgId] = _Org(m.orgId, m.orgNombre);
      }
      final orgs = porId.values.toList();
      if (!mounted) return;
      if (orgs.isEmpty) {
        setState(() {
          _error = 'Tu cuenta no tiene ninguna empresa donde subir facturas.';
          _loading = false;
        });
        return;
      }
      setState(() {
        _orgs = orgs;
        _selected = orgs.first;
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
    final org = _selected;
    if (_submitting || org == null || widget.photos.isEmpty) return;
    setState(() => _submitting = true);
    // clientProfileId = null SIEMPRE → el worker asigna el cliente por el RNC.
    await UploadQueue.instance.enqueue(
      orgId: org.orgId,
      clientProfileId: null,
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
            ? 'Factura recibida — se clasificará sola por el RNC'
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
                      // Solo si el usuario pertenece a VARIOS despachos: elegir a
                      // cuál. El cliente lo asigna el worker por el RNC, no aquí.
                      if (_error == null && _orgs.length > 1) ...[
                        const SizedBox(height: 24),
                        Text('¿A qué despacho la mandamos?',
                            style: Theme.of(context).textTheme.titleSmall),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<_Org>(
                          initialValue: _selected,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            prefixIcon: Icon(Icons.apartment_outlined),
                          ),
                          items: [
                            for (final o in _orgs)
                              DropdownMenuItem(value: o, child: Text(o.nombre)),
                          ],
                          onChanged: _submitting
                              ? null
                              : (o) => setState(() => _selected = o),
                        ),
                      ],
                    ],
                  ),
                ),
                if (_error == null)
                  SafeArea(
                    minimum: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        OutlinedButton(
                          onPressed:
                              _submitting ? null : () => Navigator.of(context).pop(),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                                vertical: 14, horizontal: 20),
                          ),
                          child: const Text('Cancelar'),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
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
                      ],
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
