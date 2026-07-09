import 'dart:io';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/upload_queue.dart';

/// Un despacho (organización) al que el usuario puede subir facturas.
class _Org {
  _Org(this.orgId, this.nombre);
  final String orgId;
  final String nombre;
}

/// Recibe fotos compartidas (Share Extension) y las sube SIN preguntar a qué
/// cliente: la factura entra "sin asignar" y el OCR la asigna sola por el RNC
/// del comprador. Si no se puede leer, queda sin asignar para que el contador la
/// asigne. Solo pregunta el despacho cuando el usuario pertenece a varios.
class SharedUploadScreen extends StatefulWidget {
  const SharedUploadScreen({super.key, required this.photos});

  final List<File> photos;

  @override
  State<SharedUploadScreen> createState() => _SharedUploadScreenState();
}

class _SharedUploadScreenState extends State<SharedUploadScreen> {
  List<_Org> _orgs = [];
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
      // Despachos donde puede subir: como cliente (por sus negocios) o como contador.
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
        _loading = false;
      });
      // Un solo despacho: subir directo, sin preguntar nada.
      if (orgs.length == 1) _upload(orgs.first);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudo cargar tu cuenta';
          _loading = false;
        });
      }
    }
  }

  Future<void> _upload(_Org org) async {
    if (_submitting || widget.photos.isEmpty) return;
    setState(() => _submitting = true);
    // clientProfileId = null → el OCR asigna el cliente por el RNC del comprador.
    await UploadQueue.instance.enqueue(
      orgId: org.orgId,
      clientProfileId: null,
      images: List.of(widget.photos),
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Factura recibida — se subirá y clasificará sola'),
      ),
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
                        child: Image.file(widget.photos[i],
                            width: 105, height: 140, fit: BoxFit.cover),
                      ),
                    ),
                  ),
                const SizedBox(height: 20),

                // Un solo despacho (o subiendo): mensaje de progreso.
                if (_error == null && _orgs.length <= 1) ...[
                  Row(
                    children: [
                      const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Subiendo tu factura… la clasificaremos sola por el RNC.',
                          style: TextStyle(color: Theme.of(context).hintColor),
                        ),
                      ),
                    ],
                  ),
                ],

                // Varios despachos: elegir a cuál (el OCR sigue asignando el cliente).
                if (_error == null && _orgs.length > 1) ...[
                  Text('¿A qué despacho la mandamos?',
                      style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 4),
                  Text(
                    'El cliente lo asigna solo el OCR por el RNC de la factura.',
                    style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13),
                  ),
                  const SizedBox(height: 10),
                  for (final o in _orgs)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.apartment_outlined),
                        title: Text(o.nombre),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: _submitting ? null : () => _upload(o),
                      ),
                    ),
                ],
              ],
            ),
    );
  }
}
