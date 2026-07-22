import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/connectivity_service.dart';
import '../services/upload_queue.dart';
import '../widgets/connectivity_badge.dart';
import '../widgets/logo.dart';
import 'capture_screen.dart';
import 'invoice_detail_screen.dart';
import 'login_screen.dart';
import 'manual_invoice_screen.dart';
import 'resumen_gastos_screen.dart';
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
const _processingStates = {'subida', 'procesando'};

/// Inicio de un CLIENTE para un negocio concreto: sus facturas + subir.
/// El negocio ya está elegido, así que la subida se archiva ahí directo.
class ClientHomeScreen extends StatefulWidget {
  const ClientHomeScreen({
    super.key,
    required this.client,
    required this.me,
    this.canSwitch = false,
  });

  final ClientAccess client;
  final Me me;
  final bool canSwitch;

  @override
  State<ClientHomeScreen> createState() => _ClientHomeScreenState();
}

class _ClientHomeScreenState extends State<ClientHomeScreen> with WidgetsBindingObserver {
  List<Invoice> _invoices = [];
  final _searchCtrl = TextEditingController();
  String? _estadoFilter; // null = todos
  String _search = '';
  String? _error;
  bool _loading = true;
  Timer? _poll;

  String get _orgId => widget.client.organizationId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    UploadQueue.instance.addListener(_onQueueChanged);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _searchCtrl.dispose();
    UploadQueue.instance.removeListener(_onQueueChanged);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) _load();
  }

  /// Facturas visibles según estado + búsqueda (filtro en cliente).
  List<Invoice> get _visible {
    var list = _invoices;
    if (_estadoFilter != null) {
      list = list.where((i) => i.estado == _estadoFilter).toList();
    }
    final q = _search.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((i) {
        return (i.razonSocialProveedor ?? '').toLowerCase().contains(q) ||
            (i.ncf ?? '').toLowerCase().contains(q) ||
            (i.rncProveedor ?? '').toLowerCase().contains(q);
      }).toList();
    }
    return list;
  }

  void _onQueueChanged() {
    if (mounted) _load();
  }

  int get _processingCount =>
      _invoices.where((i) => _processingStates.contains(i.estado)).length;

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
      final data = await ApiClient.instance.get(
        '/api/organizations/$_orgId/invoices?clientProfileId=${widget.client.id}',
      ) as List;
      if (!mounted) return;
      setState(() {
        _invoices = data
            .map((e) => Invoice.fromJson(e as Map<String, dynamic>))
            .toList()
            .newestFirst();
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
      MaterialPageRoute(
        builder: (_) => CaptureScreen(
          orgId: _orgId,
          fixedClientId: widget.client.id,
          fixedClientName: widget.client.razonSocial,
        ),
      ),
    );
    if (queued == true && mounted) {
      final online = ConnectivityService.instance.online.value;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(online
              ? 'Factura recibida — la verás procesarse aquí mismo'
              : 'Sin conexión: guardada como pendiente, se subirá al reconectar'),
        ),
      );
      _syncPolling();
      await _load();
    }
  }

  Future<void> _registrarManual() async {
    final aviso = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => ManualInvoiceScreen(
          orgId: _orgId,
          fixedClientId: widget.client.id,
          fixedClientName: widget.client.razonSocial,
          canValidar: widget.me.canValidateInOrg(_orgId),
        ),
      ),
    );
    if (aviso != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(aviso)));
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
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        // Marca de la app, no el nombre de la empresa: un cliente puede tener
        // acceso a varios negocios. Si puede cambiar, mostramos el negocio
        // activo como subtítulo para que sepa en cuál está.
        title: widget.canSwitch
            ? Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Logo(size: 20),
                  const SizedBox(height: 2),
                  Text(
                    widget.client.razonSocial,
                    style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurfaceVariant,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              )
            : const Logo(size: 24),
        actions: [
          const ConnectivityBadge(),
          IconButton(
            tooltip: 'Registrar gasto a mano',
            icon: const Icon(Icons.edit_note_outlined),
            onPressed: _registrarManual,
          ),
          // El resumen de gastos solo si el contador habilitó a este cliente.
          if (widget.me.canViewReportsInOrg(_orgId))
            IconButton(
              tooltip: 'Resumen de gastos',
              icon: const Icon(Icons.insights_outlined),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ResumenGastosScreen(
                    empresas: widget.me.clientProfiles,
                    initial: widget.client,
                  ),
                ),
              ),
            ),
          PopupMenuButton<String>(
            tooltip: 'Cuenta',
            offset: const Offset(0, 48),
            icon: CircleAvatar(
              radius: 15,
              backgroundColor: Theme.of(context).colorScheme.primaryContainer,
              child: Text(
                widget.me.initials,
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
              if (value == 'settings') {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => SettingsScreen(me: widget.me)),
                );
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem<String>(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.me.displayName,
                        style: TextStyle(
                            fontWeight: FontWeight.bold, color: scheme.onSurface)),
                    Text(widget.me.email,
                        style: TextStyle(
                            fontSize: 12, color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              if (widget.canSwitch)
                const PopupMenuItem<String>(
                  value: 'switch',
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.swap_horiz),
                    title: Text('Cambiar negocio'),
                  ),
                ),
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
        icon: const Icon(Icons.camera_alt_outlined),
        label: const Text('Subir factura'),
      ),
      body: Column(
        children: [
          const PendingUploadBanner(),
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
          // Búsqueda + filtro por estado (aparecen cuando hay facturas).
          if (!_loading && _invoices.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
              child: TextField(
                controller: _searchCtrl,
                onChanged: (v) => setState(() => _search = v),
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Buscar por proveedor, NCF o RNC…',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _search.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _searchCtrl.clear();
                            setState(() => _search = '');
                          },
                        ),
                  isDense: true,
                  filled: true,
                  fillColor: scheme.surfaceContainerHighest,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            SizedBox(
              height: 46,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  _estadoChip(null, 'Todas'),
                  for (final estado in ['en_revision', 'procesando', 'extraida', 'validada'])
                    _estadoChip(estado, estadoLabels[estado]!),
                ],
              ),
            ),
          ],
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : Builder(
                      builder: (context) {
                        final invoices = _visible;
                        if (invoices.isEmpty) {
                          return ListView(
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(32),
                                child: Text(
                                  _invoices.isEmpty
                                      ? 'Sin facturas todavía.\nToca "Subir factura" para fotografiar la primera.'
                                      : 'No hay facturas que coincidan con el filtro.',
                                  textAlign: TextAlign.center,
                                ),
                              ),
                              if (_error != null)
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16),
                                  child: Text(_error!,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(color: Colors.orange)),
                                ),
                            ],
                          );
                        }
                        return ListView.builder(
                          itemCount: invoices.length,
                          itemBuilder: (context, index) {
                            final invoice = invoices[index];
                            final color = _estadoColors[invoice.estado] ?? Colors.grey;
                            final procesando = _processingStates.contains(invoice.estado);
                            return ListTile(
                              leading: CircleAvatar(
                                backgroundColor: color.withValues(alpha: 0.15),
                                child: procesando
                                    ? SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          valueColor: AlwaysStoppedAnimation(color),
                                        ),
                                      )
                                    : Icon(Icons.receipt_long_outlined, color: color),
                              ),
                              title: Text(
                                invoice.razonSocialProveedor ??
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
                              trailing: Chip(
                                label: Text(
                                  estadoLabels[invoice.estado] ?? invoice.estado,
                                  style: TextStyle(color: color, fontSize: 12),
                                ),
                                backgroundColor: color.withValues(alpha: 0.12),
                                side: BorderSide.none,
                              ),
                              onTap: () async {
                                await Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => InvoiceDetailScreen(
                                      membership: Membership(
                                        membershipId: '',
                                        rol: 'cliente',
                                        orgId: _orgId,
                                        orgNombre: widget.client.razonSocial,
                                      ),
                                      invoiceId: invoice.id,
                                      canValidate:
                                          widget.me.canValidateInOrg(_orgId),
                                    ),
                                  ),
                                );
                                await _load();
                              },
                            );
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

  Widget _estadoChip(String? estado, String label) {
    final selected = _estadoFilter == estado;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => setState(() => _estadoFilter = selected ? null : estado),
      ),
    );
  }
}
