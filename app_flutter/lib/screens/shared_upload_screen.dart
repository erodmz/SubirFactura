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
  // Con varias fotos: false = una factura por foto (por defecto, no fusiona);
  // true = páginas de un mismo comprobante (recibo largo en partes).
  bool _comoUnaFactura = false;

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
    final photos = List.of(widget.photos);
    // clientProfileId = null SIEMPRE → el worker asigna el cliente por el RNC.
    final unaSola = _comoUnaFactura || photos.length == 1;
    if (unaSola) {
      // Una factura (todas las fotos como páginas de un mismo comprobante).
      await UploadQueue.instance
          .enqueue(orgId: org.orgId, clientProfileId: null, images: photos);
    } else {
      // Una factura por cada foto (facturas separadas).
      for (final p in photos) {
        await UploadQueue.instance
            .enqueue(orgId: org.orgId, clientProfileId: null, images: [p]);
      }
    }
    if (!mounted) return;
    // Volver a la lista (raíz) y avisar; ahí se ven subiendo.
    final messenger = ScaffoldMessenger.of(context);
    final online = ConnectivityService.instance.online.value;
    final n = unaSola ? 1 : photos.length;
    Navigator.of(context).popUntil((route) => route.isFirst);
    messenger.showSnackBar(
      SnackBar(
        content: Text(!online
            ? 'Sin conexión: guardada${n > 1 ? 's' : ''} como pendiente${n > 1 ? 's' : ''}, se subirá${n > 1 ? 'n' : ''} al reconectar'
            : n == 1
                ? 'Factura recibida — se clasificará sola por el RNC'
                : '$n facturas recibidas — se clasifican solas por el RNC'),
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
                      Text(
                        widget.photos.length > 1
                            ? '${widget.photos.length} fotos a subir'
                            : 'Factura a subir',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 12),
                      _preview(),
                      // Con varias fotos: ¿facturas separadas o una de varias páginas?
                      if (_error == null && widget.photos.length > 1) ...[
                        const SizedBox(height: 20),
                        Text('¿Cómo las subimos?',
                            style: Theme.of(context).textTheme.titleSmall),
                        const SizedBox(height: 8),
                        SegmentedButton<bool>(
                          segments: const [
                            ButtonSegment(
                                value: false, label: Text('Separadas')),
                            ButtonSegment(
                                value: true, label: Text('Una factura')),
                          ],
                          selected: {_comoUnaFactura},
                          showSelectedIcon: false,
                          onSelectionChanged: _submitting
                              ? null
                              : (s) => setState(() => _comoUnaFactura = s.first),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _comoUnaFactura
                              ? 'Se subirán como páginas de un mismo comprobante.'
                              : 'Una factura por cada foto; el RNC clasifica cada una.',
                          style: TextStyle(
                              color: Theme.of(context).hintColor, fontSize: 13),
                        ),
                      ],
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
                            label: Text(_submitting
                                ? 'Subiendo…'
                                : (!_comoUnaFactura && widget.photos.length > 1)
                                    ? 'Subir ${widget.photos.length} facturas'
                                    : 'Subir factura'),
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
