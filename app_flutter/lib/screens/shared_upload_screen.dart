import 'dart:io';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/upload_queue.dart';
import '../widgets/logo.dart';

/// Un despacho (organización) al que el usuario puede subir facturas.
class _Org {
  _Org(this.orgId, this.nombre);
  final String orgId;
  final String nombre;
}

/// Recibe fotos compartidas (Share Extension) y las sube SIN preguntar a qué
/// cliente: la factura entra "sin asignar" y el OCR la asigna sola por el RNC
/// del comprador. Si no se puede leer, queda sin asignar para que el contador la
/// asigne. Muestra un preview y un botón "Subir" explícito, y al terminar deja
/// una confirmación clara en pantalla (no cierra sola) para que el usuario sepa
/// que la factura llegó y se está procesando.
class SharedUploadScreen extends StatefulWidget {
  const SharedUploadScreen({super.key, required this.photos});

  final List<File> photos;

  @override
  State<SharedUploadScreen> createState() => _SharedUploadScreenState();
}

class _SharedUploadScreenState extends State<SharedUploadScreen> {
  List<_Org> _orgs = [];
  _Org? _selectedOrg;
  String? _error;
  bool _loading = true;
  bool _submitting = false;
  bool _done = false;

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
        _selectedOrg = orgs.first;
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
    final org = _selectedOrg;
    if (_submitting || org == null || widget.photos.isEmpty) return;
    setState(() => _submitting = true);
    // clientProfileId = null → el OCR asigna el cliente por el RNC del comprador.
    await UploadQueue.instance.enqueue(
      orgId: org.orgId,
      clientProfileId: null,
      images: List.of(widget.photos),
    );
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _done = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Logo(size: 22)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _done
              ? _confirmacion()
              : _formulario(),
    );
  }

  /// Preview de la(s) foto(s) + selector de despacho (solo si hay varios) + botón.
  Widget _formulario() {
    final scheme = Theme.of(context).colorScheme;
    return Column(
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
              const SizedBox(height: 4),
              Text(
                'La leeremos con IA y la clasificaremos sola por el RNC. No hace falta elegir cliente.',
                style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13),
              ),
              const SizedBox(height: 16),
              _preview(),
              if (_error == null && _orgs.length > 1) ...[
                const SizedBox(height: 24),
                Text('¿A qué despacho la mandamos?',
                    style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                DropdownButtonFormField<_Org>(
                  initialValue: _selectedOrg,
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
                      : (o) => setState(() => _selectedOrg = o),
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
    );
  }

  /// Confirmación persistente: el usuario ve que la factura llegó y se procesa.
  Widget _confirmacion() {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 40,
            backgroundColor: scheme.primaryContainer,
            child: Icon(Icons.check_rounded,
                size: 44, color: scheme.onPrimaryContainer),
          ),
          const SizedBox(height: 20),
          Text('¡Factura recibida!',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(
            'La estamos leyendo con IA y la clasificaremos sola por el RNC. '
            'La verás en tus facturas en unos segundos.',
            style: TextStyle(color: Theme.of(context).hintColor),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: const Text('Listo'),
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
            width: double.infinity, height: 320, fit: BoxFit.cover),
      );
    }
    return SizedBox(
      height: 200,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: widget.photos.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) => ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.file(widget.photos[i],
              width: 150, height: 200, fit: BoxFit.cover),
        ),
      ),
    );
  }
}
