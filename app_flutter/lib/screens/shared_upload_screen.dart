import 'dart:io';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/upload_queue.dart';

/// Destino posible para una factura compartida desde otra app (Fotos, etc.).
class _Destino {
  _Destino({
    required this.orgId,
    required this.clientProfileId,
    required this.label,
    required this.subtitle,
  });
  final String orgId;
  final String? clientProfileId;
  final String label;
  final String subtitle;
}

/// Recibe fotos compartidas (Share Extension) y las encola para subir, igual
/// que si se hubieran tomado en la app. Deja elegir a qué empresa van.
class SharedUploadScreen extends StatefulWidget {
  const SharedUploadScreen({super.key, required this.photos});

  final List<File> photos;

  @override
  State<SharedUploadScreen> createState() => _SharedUploadScreenState();
}

class _SharedUploadScreenState extends State<SharedUploadScreen> {
  List<_Destino> _destinos = [];
  _Destino? _selected;
  String? _error;
  bool _loading = true;

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
      final destinos = <_Destino>[
        for (final c in me.clientProfiles)
          _Destino(
            orgId: c.organizationId,
            clientProfileId: c.id,
            label: c.razonSocial,
            subtitle: 'Tu negocio',
          ),
        for (final m in me.contadorMemberships)
          _Destino(
            orgId: m.orgId,
            clientProfileId: null,
            label: m.orgNombre,
            subtitle: 'Despacho · se asigna sola por el RNC',
          ),
      ];
      if (!mounted) return;
      setState(() {
        _destinos = destinos;
        _selected = destinos.length == 1 ? destinos.first : null;
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

  Future<void> _submit() async {
    final dest = _selected;
    if (dest == null || widget.photos.isEmpty) return;
    await UploadQueue.instance.enqueue(
      orgId: dest.orgId,
      clientProfileId: dest.clientProfileId,
      images: List.of(widget.photos),
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Factura recibida — se subirá y procesará sola')),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Subir factura compartida')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null) ...[
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 12),
                ],
                if (widget.photos.isNotEmpty)
                  SizedBox(
                    height: 140,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: widget.photos.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 10),
                      itemBuilder: (context, i) => ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.file(widget.photos[i], width: 105, height: 140, fit: BoxFit.cover),
                      ),
                    ),
                  ),
                const SizedBox(height: 20),
                if (_destinos.isNotEmpty) ...[
                  Text('¿A qué empresa la subimos?',
                      style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  for (final d in _destinos)
                    Card(
                      child: ListTile(
                        onTap: () => setState(() => _selected = d),
                        leading: Icon(
                          _selected == d ? Icons.check_circle : Icons.circle_outlined,
                          color: _selected == d
                              ? Theme.of(context).colorScheme.primary
                              : Theme.of(context).hintColor,
                        ),
                        title: Text(d.label),
                        subtitle: Text(d.subtitle),
                      ),
                    ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _selected != null ? _submit : null,
                      style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
                      child: const Text('Subir factura'),
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}
