import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/upload_queue.dart';

/// Captura de factura: una o varias fotos (páginas) de un mismo comprobante.
/// Útil para recibos largos que no caben en una sola foto (§5.1).
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key, required this.membership});

  final Membership membership;

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  List<ClientProfile> _clients = [];
  ClientProfile? _selected;
  final List<File> _photos = [];
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadClients();
  }

  Future<void> _loadClients() async {
    try {
      final data = await ApiClient.instance
          .get('/api/organizations/${widget.membership.orgId}/clients') as List;
      if (!mounted) return;
      setState(() {
        _clients = data.map((e) => ClientProfile.fromJson(e as Map<String, dynamic>)).toList();
        _selected = _clients.length == 1 ? _clients.first : null;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'No se pudieron cargar los clientes';
          _loading = false;
        });
      }
    }
  }

  Future<void> _addPhoto(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600, // suficiente para leer NCF/RNC sin pasar de ~1–2 MB
      imageQuality: 85,
    );
    if (picked != null && mounted) {
      setState(() => _photos.add(File(picked.path)));
    }
  }

  Future<void> _submit() async {
    if (_selected == null || _photos.isEmpty) return;
    await UploadQueue.instance.enqueue(
      orgId: widget.membership.orgId,
      clientProfileId: _selected!.id,
      images: List.of(_photos),
    );
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nueva factura')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null)
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                if (_clients.length > 1) ...[
                  DropdownButtonFormField<ClientProfile>(
                    initialValue: _selected,
                    decoration: const InputDecoration(
                      labelText: 'Cliente',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final client in _clients)
                        DropdownMenuItem(
                          value: client,
                          child: Text('${client.razonSocial} (${client.rncOCedula})'),
                        ),
                    ],
                    onChanged: (value) => setState(() => _selected = value),
                  ),
                  const SizedBox(height: 16),
                ],
                Card(
                  color: Colors.blue.shade50,
                  child: const Padding(
                    padding: EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Guías para una buena foto',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                        SizedBox(height: 8),
                        Text('• Encuadra la factura completa, los 4 bordes visibles'),
                        Text('• Apóyala sobre una superficie plana y oscura'),
                        Text('• Evita sombras, reflejos y dedos sobre el papel'),
                        Text('• El NCF, RNC y los montos deben leerse con claridad'),
                        SizedBox(height: 8),
                        Text('¿Recibo muy largo? Tómale varias fotos por secciones '
                            '(de arriba hacia abajo) y agrégalas como páginas: la IA las lee juntas.',
                            style: TextStyle(fontStyle: FontStyle.italic)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (_photos.isNotEmpty) ...[
                  _PagesStrip(
                    photos: _photos,
                    onRemove: (i) => setState(() => _photos.removeAt(i)),
                  ),
                  const SizedBox(height: 16),
                ],
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => _addPhoto(ImageSource.camera),
                        icon: const Icon(Icons.camera_alt),
                        label: Text(_photos.isEmpty ? 'Tomar foto' : 'Agregar página'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton.icon(
                      onPressed: () => _addPhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library),
                      label: const Text('Galería'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _photos.isNotEmpty && _selected != null ? _submit : null,
                  style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
                  child: Text(
                    _photos.length <= 1
                        ? 'Subir factura'
                        : 'Subir factura (${_photos.length} páginas)',
                  ),
                ),
              ],
            ),
    );
  }
}

/// Tira horizontal de páginas capturadas, con número y botón de quitar.
class _PagesStrip extends StatelessWidget {
  const _PagesStrip({required this.photos, required this.onRemove});

  final List<File> photos;
  final void Function(int index) onRemove;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 150,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: photos.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) => Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.file(photos[i], width: 110, height: 150, fit: BoxFit.cover),
            ),
            Positioned(
              left: 6,
              top: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('${i + 1}',
                    style: const TextStyle(color: Colors.white, fontSize: 12)),
              ),
            ),
            Positioned(
              right: 2,
              top: 2,
              child: IconButton(
                icon: const Icon(Icons.cancel, color: Colors.white),
                style: IconButton.styleFrom(backgroundColor: Colors.black38),
                iconSize: 20,
                visualDensity: VisualDensity.compact,
                onPressed: () => onRemove(i),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
