import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/upload_queue.dart';

/// Captura con guías de encuadre (ESPECIFICACION.md §5.1). La foto se comprime
/// (~1–2 MB JPEG) y entra a la cola offline-first.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key, required this.membership});

  final Membership membership;

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  List<ClientProfile> _clients = [];
  ClientProfile? _selected;
  File? _photo;
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

  Future<void> _takePhoto(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600, // suficiente para leer NCF/RNC sin pasar de ~1–2 MB
      imageQuality: 85,
    );
    if (picked != null && mounted) {
      setState(() => _photo = File(picked.path));
    }
  }

  Future<void> _submit() async {
    if (_selected == null || _photo == null) return;
    await UploadQueue.instance.enqueue(
      orgId: widget.membership.orgId,
      clientProfileId: _selected!.id,
      image: _photo!,
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
                    value: _selected,
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
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (_photo != null) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.file(_photo!, height: 320, fit: BoxFit.cover),
                  ),
                  const SizedBox(height: 16),
                ],
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => _takePhoto(ImageSource.camera),
                        icon: const Icon(Icons.camera_alt),
                        label: Text(_photo == null ? 'Tomar foto' : 'Re-tomar'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton.icon(
                      onPressed: () => _takePhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library),
                      label: const Text('Galería'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _photo != null && _selected != null ? _submit : null,
                  style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
                  child: const Text('Subir factura'),
                ),
              ],
            ),
    );
  }
}
