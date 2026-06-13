import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/upload_queue.dart';
import 'capture_screen.dart';
import 'invoice_detail_screen.dart';

const _estadoColors = <String, Color>{
  'subida': Colors.blueGrey,
  'procesando': Colors.blue,
  'extraida': Colors.teal,
  'en_revision': Colors.orange,
  'validada': Colors.green,
  'incluida_en_606': Colors.indigo,
  'reportada': Colors.indigo,
  'rechazada': Colors.red,
  'duplicada': Colors.red,
};

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.membership});

  final Membership membership;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Invoice> _invoices = [];
  String? _filtro;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    UploadQueue.instance.addListener(_onQueueChanged);
    _load();
  }

  @override
  void dispose() {
    UploadQueue.instance.removeListener(_onQueueChanged);
    super.dispose();
  }

  void _onQueueChanged() {
    if (mounted) _load();
  }

  Future<void> _load() async {
    try {
      final query = _filtro == null ? '' : '?estado=$_filtro';
      final data = await ApiClient.instance
          .get('/api/organizations/${widget.membership.orgId}/invoices$query') as List;
      if (!mounted) return;
      setState(() {
        _invoices = data.map((e) => Invoice.fromJson(e as Map<String, dynamic>)).toList();
        _loading = false;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Sin conexión: mostrando lo último disponible');
    }
  }

  Future<void> _capture() async {
    final queued = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CaptureScreen(membership: widget.membership)),
    );
    if (queued == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Factura en cola: se sube automáticamente')),
      );
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final queue = UploadQueue.instance;
    return Scaffold(
      appBar: AppBar(title: Text(widget.membership.orgNombre)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _capture,
        icon: const Icon(Icons.camera_alt),
        label: const Text('Subir factura'),
      ),
      body: Column(
        children: [
          ListenableBuilder(
            listenable: queue,
            builder: (context, _) {
              if (queue.pendingCount == 0 && queue.lastRejection == null) {
                return const SizedBox.shrink();
              }
              return Material(
                color: queue.lastRejection != null ? Colors.red.shade50 : Colors.amber.shade50,
                child: ListTile(
                  dense: true,
                  leading: Icon(
                    queue.lastRejection != null ? Icons.error_outline : Icons.cloud_upload,
                    color: queue.lastRejection != null ? Colors.red : Colors.amber.shade800,
                  ),
                  title: Text(
                    queue.lastRejection ??
                        '${queue.pendingCount} factura(s) esperando conexión para subir',
                  ),
                  trailing: queue.lastRejection != null
                      ? IconButton(
                          icon: const Icon(Icons.close, size: 18),
                          onPressed: queue.clearRejection,
                        )
                      : null,
                ),
              );
            },
          ),
          SizedBox(
            height: 56,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              children: [
                _chip(null, 'Todas'),
                for (final estado in ['en_revision', 'procesando', 'extraida', 'validada'])
                  _chip(estado, estadoLabels[estado]!),
              ],
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!, style: const TextStyle(color: Colors.orange)),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _invoices.isEmpty
                      ? ListView(
                          children: const [
                            Padding(
                              padding: EdgeInsets.all(32),
                              child: Text(
                                'Sin facturas todavía.\nToca "Subir factura" para fotografiar la primera.',
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                        )
                      : ListView.builder(
                          itemCount: _invoices.length,
                          itemBuilder: (context, index) {
                            final invoice = _invoices[index];
                            final color = _estadoColors[invoice.estado] ?? Colors.grey;
                            return ListTile(
                              leading: CircleAvatar(
                                backgroundColor: color.withOpacity(0.15),
                                child: Icon(Icons.receipt_long, color: color),
                              ),
                              title: Text(
                                invoice.razonSocialProveedor ??
                                    invoice.clientRazonSocial ??
                                    'Factura',
                              ),
                              subtitle: Text(
                                [
                                  if (invoice.ncf != null) invoice.ncf,
                                  invoice.fecha ??
                                      invoice.createdAt.toIso8601String().substring(0, 10),
                                ].join(' · '),
                              ),
                              trailing: Chip(
                                label: Text(
                                  estadoLabels[invoice.estado] ?? invoice.estado,
                                  style: TextStyle(color: color, fontSize: 12),
                                ),
                                backgroundColor: color.withOpacity(0.12),
                                side: BorderSide.none,
                              ),
                              onTap: () async {
                                await Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => InvoiceDetailScreen(
                                      membership: widget.membership,
                                      invoiceId: invoice.id,
                                    ),
                                  ),
                                );
                                await _load();
                              },
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String? estado, String label) {
    final selected = _filtro == estado;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) {
          setState(() => _filtro = selected ? null : estado);
          _load();
        },
      ),
    );
  }
}
