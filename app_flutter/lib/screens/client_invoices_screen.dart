import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
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

/// Inicio de un CLIENTE con acceso a VARIOS negocios: todas sus facturas en una
/// sola pantalla, con un filtro de empresas arriba (incluye "Todas"), búsqueda y
/// filtro por estado. Cada negocio es (organización, client_profile); "Todas"
/// une las facturas de todos.
class ClientInvoicesScreen extends StatefulWidget {
  const ClientInvoicesScreen({super.key, required this.me});

  final Me me;

  @override
  State<ClientInvoicesScreen> createState() => _ClientInvoicesScreenState();
}

class _ClientInvoicesScreenState extends State<ClientInvoicesScreen> {
  final Map<String, List<Invoice>> _byBusiness = {};
  final Map<String, String> _bizNameByInvoice = {};
  // Mis subidas del share aún SIN asignar (el worker las clasifica por RNC).
  // Se muestran en "Todas" para que el usuario las vea procesándose.
  final List<Invoice> _unassigned = [];
  final _searchCtrl = TextEditingController();

  String? _businessFilter; // null = todas
  String? _estadoFilter; // null = todos
  String _search = '';
  String? _error;
  bool _loading = true;
  Timer? _poll;

  List<ClientAccess> get _businesses => widget.me.clientProfiles;

  /// Negocios cuyo despacho habilitó a este cliente a ver el resumen de gastos.
  List<ClientAccess> get _reportables => _businesses
      .where((b) => widget.me.canViewReportsInOrg(b.organizationId))
      .toList();

  @override
  void initState() {
    super.initState();
    UploadQueue.instance.addListener(_onQueueChanged);
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _searchCtrl.dispose();
    UploadQueue.instance.removeListener(_onQueueChanged);
    super.dispose();
  }

  void _onQueueChanged() {
    if (mounted) _load();
  }

  Future<void> _load() async {
    var anyError = false;
    final map = <String, List<Invoice>>{};
    final nameByInvoice = <String, String>{};
    // Se reconstruye desde cero en cada carga (NO se siembra con el valor
    // anterior): si no, una factura que el worker ya asignó seguiría apareciendo
    // como copia fantasma "Procesando". Cada consulta por-negocio devuelve las
    // sin asignar, así que aquí solo deduplicamos.
    final unassignedById = <String, Invoice>{};
    await Future.wait(_businesses.map((b) async {
      try {
        final data = await ApiClient.instance.get(
          '/api/organizations/${b.organizationId}/invoices?clientProfileId=${b.id}',
        ) as List;
        final invoices =
            data.map((e) => Invoice.fromJson(e as Map<String, dynamic>)).toList();
        // Asignadas a este negocio → su bucket; sin asignar → bucket compartido.
        map[b.id] = invoices.where((i) => i.clientProfileId == b.id).toList();
        for (final inv in map[b.id]!) {
          nameByInvoice[inv.id] = b.razonSocial;
        }
        for (final inv in invoices.where((i) => i.clientProfileId == null)) {
          unassignedById[inv.id] = inv;
        }
      } catch (_) {
        anyError = true;
        map[b.id] = _byBusiness[b.id] ?? const [];
        for (final inv in map[b.id]!) {
          nameByInvoice[inv.id] = b.razonSocial;
        }
      }
    }));
    // Si alguna consulta ya la vio asignada (raza en el instante en que el
    // worker la clasifica), no la muestres además como "sin asignar".
    final asignadas = <String>{
      for (final list in map.values)
        for (final inv in list) inv.id,
    };
    unassignedById.removeWhere((id, _) => asignadas.contains(id));
    if (!mounted) return;
    setState(() {
      _byBusiness
        ..clear()
        ..addAll(map);
      _bizNameByInvoice
        ..clear()
        ..addAll(nameByInvoice);
      _unassigned
        ..clear()
        ..addAll(unassignedById.values);
      _loading = false;
      _error = anyError ? 'Algunas facturas no se pudieron actualizar' : null;
    });
    _syncPolling();
  }

  /// Todas las facturas (todos los negocios + mis subidas sin asignar), desc.
  List<Invoice> get _allInvoices {
    final list = <Invoice>[];
    for (final b in _businesses) {
      list.addAll(_byBusiness[b.id] ?? const []);
    }
    list.addAll(_unassigned);
    list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return list;
  }

  int _countFor(String? businessId) => businessId == null
      ? _allInvoices.length
      : (_byBusiness[businessId]?.length ?? 0);

  /// Facturas visibles según empresa + estado + búsqueda. Las subidas sin
  /// asignar (share en proceso) se ven en TODOS los filtros: si subo algo, lo veo.
  List<Invoice> get _visible {
    List<Invoice> list;
    if (_businessFilter == null) {
      list = _allInvoices;
    } else {
      list = [...(_byBusiness[_businessFilter] ?? const []), ..._unassigned]
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }
    if (_estadoFilter != null) {
      list = list.where((i) => i.estado == _estadoFilter).toList();
    }
    final q = _search.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((i) {
        return (i.razonSocialProveedor ?? '').toLowerCase().contains(q) ||
            (i.ncf ?? '').toLowerCase().contains(q) ||
            (i.rncProveedor ?? '').toLowerCase().contains(q) ||
            (_bizNameByInvoice[i.id] ?? '').toLowerCase().contains(q);
      }).toList();
    }
    return list;
  }

  int get _processingCount =>
      _allInvoices.where((i) => _processingStates.contains(i.estado)).length;

  void _syncPolling() {
    final active = _processingCount > 0 || UploadQueue.instance.pendingCount > 0;
    if (active) {
      _poll ??= Timer.periodic(const Duration(seconds: 3), (_) => _load());
    } else {
      _poll?.cancel();
      _poll = null;
    }
  }

  /// Distintas organizaciones de los negocios del cliente.
  Set<String> get _orgIds => _businesses.map((b) => b.organizationId).toSet();

  Future<void> _capture() async {
    // Si hay una empresa filtrada, la factura va a ese negocio. Si es "Todas":
    // con un solo despacho la subimos sin asignar (el OCR la clasifica por RNC);
    // con varios despachos preguntamos a qué negocio.
    ClientAccess? target;
    if (_businessFilter != null) {
      target = _businesses.firstWhere((b) => b.id == _businessFilter);
    } else if (_orgIds.length > 1) {
      target = await _pickBusiness();
      if (target == null) return;
    }

    if (!mounted) return;
    final orgId = target?.organizationId ?? _businesses.first.organizationId;
    final queued = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => CaptureScreen(
          orgId: orgId,
          fixedClientId: target?.id, // null → OCR asigna por RNC
          fixedClientName: target?.razonSocial,
        ),
      ),
    );
    if (queued == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Factura recibida — la verás procesarse aquí mismo')),
      );
      _syncPolling();
      await _load();
    }
  }

  /// Hoja inferior para elegir negocio cuando "Todas" abarca varios despachos.
  Future<ClientAccess?> _pickBusiness() {
    return showModalBottomSheet<ClientAccess>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Text('¿Para cuál negocio?',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
            for (final b in _businesses)
              ListTile(
                leading: CircleAvatar(
                  child: Text((b.razonSocial.isNotEmpty ? b.razonSocial[0] : '?')
                      .toUpperCase()),
                ),
                title: Text(b.razonSocial),
                subtitle: Text(b.rncOCedula),
                onTap: () => Navigator.of(context).pop(b),
              ),
          ],
        ),
      ),
    );
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
        title: const Logo(size: 24),
        actions: [
          const ConnectivityBadge(),
          if (_reportables.isNotEmpty)
            IconButton(
              tooltip: 'Resumen de gastos',
              icon: const Icon(Icons.insights_outlined),
              onPressed: () {
                // Solo las empresas cuyo despacho habilitó ver reportes.
                final selected = _businessFilter == null
                    ? null
                    : _businesses.firstWhere((b) => b.id == _businessFilter);
                final initial = (selected != null && _reportables.contains(selected))
                    ? selected
                    : _reportables.first;
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ResumenGastosScreen(
                      empresas: _reportables,
                      initial: initial,
                    ),
                  ),
                );
              },
            ),
          _accountMenu(scheme),
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
          _businessFilterBar(scheme),
          _searchBar(scheme),
          _estadoBar(),
          _processingBanner(scheme),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(_error!, style: const TextStyle(color: Colors.orange)),
            ),
          Expanded(child: _list()),
        ],
      ),
    );
  }

  Widget _accountMenu(ColorScheme scheme) {
    final me = widget.me;
    return PopupMenuButton<String>(
      tooltip: 'Cuenta',
      offset: const Offset(0, 48),
      icon: CircleAvatar(
        radius: 15,
        backgroundColor: scheme.primaryContainer,
        child: Text(
          me.initials,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: scheme.onPrimaryContainer,
          ),
        ),
      ),
      onSelected: (value) {
        if (value == 'logout') _logout();
        if (value == 'settings') {
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
              Text(me.displayName,
                  style: TextStyle(fontWeight: FontWeight.bold, color: scheme.onSurface)),
              Text(me.email,
                  style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
            ],
          ),
        ),
        const PopupMenuDivider(),
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
    );
  }

  /// Filtro de empresas: píldoras horizontales con "Todas" + cada negocio.
  Widget _businessFilterBar(ColorScheme scheme) {
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          _bizPill(scheme, id: null, label: 'Todas', icon: Icons.grid_view_outlined),
          for (final b in _businesses)
            _bizPill(scheme, id: b.id, label: b.razonSocial, icon: Icons.storefront_outlined),
        ],
      ),
    );
  }

  Widget _bizPill(
    ColorScheme scheme, {
    required String? id,
    required String label,
    required IconData icon,
  }) {
    final selected = _businessFilter == id;
    final count = _countFor(id);
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: selected ? scheme.primary : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: () => setState(() => _businessFilter = id),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(
              children: [
                Icon(icon,
                    size: 16,
                    color: selected ? scheme.onPrimary : scheme.onSurfaceVariant),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    color: selected ? scheme.onPrimary : scheme.onSurface,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(
                    color: selected
                        ? scheme.onPrimary.withValues(alpha: 0.22)
                        : scheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: selected ? scheme.onPrimary : scheme.primary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _searchBar(ColorScheme scheme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 6),
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
    );
  }

  Widget _estadoBar() {
    return SizedBox(
      height: 46,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          _estadoChip(null, 'Todas'),
          for (final estado in ['en_revision', 'procesando', 'extraida', 'validada'])
            _estadoChip(estado, estadoLabels[estado]!),
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

  Widget _processingBanner(ColorScheme scheme) {
    return AnimatedSize(
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
    );
  }

  Widget _list() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final invoices = _visible;
    return RefreshIndicator(
      onRefresh: _load,
      child: invoices.isEmpty
          ? ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    _search.isNotEmpty || _estadoFilter != null || _businessFilter != null
                        ? 'No hay facturas que coincidan con el filtro.'
                        : 'Sin facturas todavía.\nToca "Subir factura" para fotografiar la primera.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            )
          : ListView.builder(
              itemCount: invoices.length,
              itemBuilder: (context, index) => _tile(invoices[index]),
            ),
    );
  }

  Widget _tile(Invoice invoice) {
    final color = _estadoColors[invoice.estado] ?? Colors.grey;
    final procesando = _processingStates.contains(invoice.estado);
    final bizName = _bizNameByInvoice[invoice.id];
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
        invoice.razonSocialProveedor ?? (procesando ? 'Factura nueva' : 'Factura'),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            procesando
                ? 'Leyendo los datos…'
                : [
                    if (invoice.ncf != null) invoice.ncf,
                    invoice.fecha ??
                        invoice.createdAt.toIso8601String().substring(0, 10),
                  ].join(' · '),
          ),
          // En "Todas" mostramos a qué negocio pertenece cada factura.
          if (_businessFilter == null && bizName != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                children: [
                  Icon(Icons.storefront_outlined,
                      size: 13, color: Theme.of(context).hintColor),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      bizName,
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).hintColor,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
      isThreeLine: _businessFilter == null && bizName != null && !procesando,
      trailing: Chip(
        label: Text(
          estadoLabels[invoice.estado] ?? invoice.estado,
          style: TextStyle(color: color, fontSize: 12),
        ),
        backgroundColor: color.withValues(alpha: 0.12),
        side: BorderSide.none,
      ),
      onTap: () async {
        // El negocio de esta factura (para dar contexto y permiso de validar).
        final biz = _businesses.firstWhere(
          (b) => (_byBusiness[b.id] ?? const []).any((i) => i.id == invoice.id),
          orElse: () => _businesses.first,
        );
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => InvoiceDetailScreen(
              membership: Membership(
                membershipId: '',
                rol: 'cliente',
                orgId: biz.organizationId,
                orgNombre: biz.razonSocial,
              ),
              invoiceId: invoice.id,
              canValidate: widget.me.canValidateInOrg(biz.organizationId),
            ),
          ),
        );
        await _load();
      },
    );
  }
}
