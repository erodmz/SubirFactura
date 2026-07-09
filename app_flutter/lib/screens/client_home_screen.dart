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

class _ClientHomeScreenState extends State<ClientHomeScreen> {
  List<Invoice> _invoices = [];
  String? _error;
  bool _loading = true;
  Timer? _poll;

  String get _orgId => widget.client.organizationId;

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
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _invoices.isEmpty
                      ? ListView(
                          children: [
                            const Padding(
                              padding: EdgeInsets.all(32),
                              child: Text(
                                'Sin facturas todavía.\nToca "Subir factura" para fotografiar la primera.',
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
                        )
                      : ListView.builder(
                          itemCount: _invoices.length,
                          itemBuilder: (context, index) {
                            final invoice = _invoices[index];
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
                        ),
            ),
          ),
        ],
      ),
    );
  }
}
