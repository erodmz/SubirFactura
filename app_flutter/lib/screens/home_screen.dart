import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/upload_queue.dart';
import 'capture_screen.dart';
import 'invoice_detail_screen.dart';
import 'login_screen.dart';
import 'settings_screen.dart';

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

/// Estados que el worker aún está moviendo: mientras haya alguno, refrescamos
/// en vivo para que el usuario vea el resultado sin cambiar de pantalla.
const _processingStates = {'subida', 'procesando'};

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.membership,
    this.me,
    this.canSwitchOrg = false,
  });

  final Membership membership;
  final Me? me;
  final bool canSwitchOrg;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Invoice> _invoices = [];
  String? _filtro;
  String? _error;
  bool _loading = true;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    UploadQueue.instance.addListener(_onQueueChanged);
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    UploadQueue.instance.removeListener(_onQueueChanged);
    super.dispose();
  }

  void _onQueueChanged() {
    if (mounted) _load();
  }

  int get _processingCount =>
      _invoices.where((i) => _processingStates.contains(i.estado)).length;

  /// Refresca cada 3 s mientras haya facturas en proceso o subidas pendientes.
  void _syncPolling() {
    final active = _processingCount > 0 || UploadQueue.instance.pendingCount > 0;
    if (active) {
      _poll ??= Timer.periodic(const Duration(seconds: 3), (_) => _load());
    } else {
      _poll?.cancel();
      _poll = null;
    }
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
      _syncPolling();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Sin conexión: mostrando lo último disponible');
    }
  }

  Future<void> _capture() async {
    final queued = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CaptureScreen(orgId: widget.membership.orgId)),
    );
    if (queued == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Factura recibida — la verás procesarse aquí mismo')),
      );
      _syncPolling();
      await _load();
    }
  }

  Future<void> _logout() async {
    await ApiClient.instance.clearTokens();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final queue = UploadQueue.instance;
    final me = widget.me;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.membership.orgNombre),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Cuenta',
            offset: const Offset(0, 48),
            icon: CircleAvatar(
              radius: 15,
              backgroundColor: Theme.of(context).colorScheme.primaryContainer,
              child: Text(
                me?.initials ?? '··',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                ),
              ),
            ),
            onSelected: (value) {
              if (value == 'logout') _logout();
              if (value == 'switch') Navigator.of(context).pop();
              if (value == 'settings' && me != null) {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => SettingsScreen(me: me)),
                );
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem<String>(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(me?.displayName ?? 'Mi cuenta',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.black87)),
                    if (me != null)
                      Text(me.email,
                          style: const TextStyle(fontSize: 12, color: Colors.black54)),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              if (widget.canSwitchOrg)
                const PopupMenuItem<String>(
                  value: 'switch',
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.swap_horiz),
                    title: Text('Cambiar empresa'),
                  ),
                ),
              if (me != null)
                const PopupMenuItem<String>(
                  value: 'settings',
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.settings_outlined),
                    title: Text('Mi cuenta'),
                  ),
                ),
              const PopupMenuItem<String>(
                value: 'logout',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.logout),
                  title: Text('Cerrar sesión'),
                ),
              ),
            ],
          ),
        ],
      ),
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
              if (queue.lastRejection != null) {
                return Material(
                  color: scheme.errorContainer,
                  child: ListTile(
                    dense: true,
                    iconColor: scheme.onErrorContainer,
                    textColor: scheme.onErrorContainer,
                    leading: const Icon(Icons.error_outline),
                    title: Text(queue.lastRejection!),
                    trailing: IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      color: scheme.onErrorContainer,
                      onPressed: queue.clearRejection,
                    ),
                  ),
                );
              }
              if (queue.pendingCount > 0) {
                return Material(
                  color: scheme.secondaryContainer,
                  child: ListTile(
                    dense: true,
                    iconColor: scheme.onSecondaryContainer,
                    textColor: scheme.onSecondaryContainer,
                    leading: const Icon(Icons.cloud_upload),
                    title: Text('${queue.pendingCount} factura(s) subiendo…'),
                  ),
                );
              }
              return const SizedBox.shrink();
            },
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            child: _processingCount > 0
                ? Material(
                    color: scheme.primaryContainer,
                    child: ListTile(
                      dense: true,
                      textColor: scheme.onPrimaryContainer,
                      leading: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: scheme.onPrimaryContainer,
                        ),
                      ),
                      title: Text('Leyendo $_processingCount factura(s) con IA…'),
                      subtitle: Text(
                        'Se actualiza solo en unos segundos',
                        style: TextStyle(
                          color: scheme.onPrimaryContainer.withValues(alpha: 0.7),
                        ),
                      ),
                    ),
                  )
                : const SizedBox(width: double.infinity),
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
                            final procesando = _processingStates.contains(invoice.estado);
                            return ListTile(
                              leading: AnimatedSwitcher(
                                duration: const Duration(milliseconds: 300),
                                child: CircleAvatar(
                                  key: ValueKey(procesando),
                                  backgroundColor: color.withOpacity(0.15),
                                  child: procesando
                                      ? SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.5,
                                            valueColor: AlwaysStoppedAnimation(color),
                                          ),
                                        )
                                      : Icon(Icons.receipt_long, color: color),
                                ),
                              ),
                              title: Text(
                                invoice.razonSocialProveedor ??
                                    invoice.clientRazonSocial ??
                                    (procesando ? 'Factura nueva' : 'Factura'),
                              ),
                              subtitle: Text(
                                procesando
                                    ? 'Leyendo los datos…'
                                    : [
                                        if (invoice.ncf != null) invoice.ncf,
                                        invoice.fecha ??
                                            invoice.createdAt.toIso8601String().substring(0, 10),
                                      ].join(' · '),
                              ),
                              trailing: AnimatedSwitcher(
                                duration: const Duration(milliseconds: 300),
                                transitionBuilder: (child, anim) =>
                                    FadeTransition(opacity: anim, child: child),
                                child: Chip(
                                  key: ValueKey(invoice.estado),
                                  label: Text(
                                    estadoLabels[invoice.estado] ?? invoice.estado,
                                    style: TextStyle(color: color, fontSize: 12),
                                  ),
                                  backgroundColor: color.withOpacity(0.12),
                                  side: BorderSide.none,
                                ),
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
