import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/upload_queue.dart';

/// Captura de factura: una o varias fotos (páginas) de un mismo comprobante.
/// Útil para recibos largos que no caben en una sola foto (§5.1).
///
/// Cliente: se pasa [fixedClientId] (su empresa). Contador: se sube sin empresa
/// y el sistema la auto-asigna por el RNC del comprador (QR e-CF).
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({
    super.key,
    required this.orgId,
    this.fixedClientId,
    this.fixedClientName,
  });

  final String orgId;
  final String? fixedClientId;
  final String? fixedClientName;

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  final List<File> _photos = [];
  String? _error;

  bool get _clientFixed => widget.fixedClientId != null;

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
    if (_photos.isEmpty) return;
    await UploadQueue.instance.enqueue(
      orgId: widget.orgId,
      clientProfileId: widget.fixedClientId, // null para el contador → auto-asigna
      images: List.of(_photos),
    );
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nueva factura')),
      body: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null)
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                if (!_clientFixed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'La empresa se asignará automáticamente según el RNC de la factura.',
                      style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13),
                    ),
                  ),
                Card(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: DefaultTextStyle.merge(
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                      ),
                      child: const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Guías para una buena foto',
                              style: TextStyle(fontWeight: FontWeight.bold)),
                          SizedBox(height: 8),
                          Text('• Encuadra la factura completa, los 4 bordes visibles'),
                          Text('• Apóyala sobre una superficie plana y con buena luz'),
                          Text('• Evita sombras, reflejos y dedos sobre el papel'),
                          Text('• El NCF, RNC y los montos deben leerse con claridad'),
                          SizedBox(height: 8),
                          Text('¿Factura electrónica (e-CF) con código QR? Inclúyelo '
                              'completo y nítido en la foto: lo leemos automáticamente '
                              'y llenamos los datos oficiales de la DGII.',
                              style: TextStyle(fontWeight: FontWeight.w600)),
                          SizedBox(height: 8),
                          Text('¿Recibo muy largo? Tómale varias fotos por secciones '
                              '(de arriba hacia abajo) y agrégalas como páginas: la IA las lee juntas.',
                              style: TextStyle(fontStyle: FontStyle.italic)),
                        ],
                      ),
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
                        icon: const Icon(Icons.camera_alt_outlined),
                        label: Text(_photos.isEmpty ? 'Tomar foto o escanear QR' : 'Agregar página'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton.icon(
                      onPressed: () => _addPhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Galería'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _photos.isNotEmpty ? _submit : null,
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
                icon: const Icon(Icons.cancel_outlined, color: Colors.white),
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
