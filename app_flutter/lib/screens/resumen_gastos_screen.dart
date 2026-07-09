import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/connectivity_service.dart';
import '../widgets/error_banner.dart';

/// Resumen de gastos POR EMPRESA (contribuyente): total, ITBIS, por categoría,
/// por mes y principales proveedores. Lo ve quien tenga acceso a la(s) empresa(s);
/// si hay más de una, se elige cuál con el selector. El backend limita lo que
/// cada rol puede ver.
///
/// - Rol cliente: se le pasan sus negocios en [empresas].
/// - Rol contador/admin: se le pasa [contadorOrg] y la pantalla carga los
///   clientes de esa organización.
class ResumenGastosScreen extends StatefulWidget {
  const ResumenGastosScreen({
    super.key,
    this.empresas,
    this.initial,
    this.contadorOrg,
  }) : assert(empresas != null || contadorOrg != null,
            'Pasa empresas (cliente) o contadorOrg (contador)');

  final List<ClientAccess>? empresas;
  final ClientAccess? initial;
  final Membership? contadorOrg;

  @override
  State<ResumenGastosScreen> createState() => _ResumenGastosScreenState();
}

class _ResumenGastosScreenState extends State<ResumenGastosScreen> {
  List<ClientAccess> _empresas = [];
  ClientAccess? _selected;
  ResumenGastos? _data;
  String? _error;
  IconData _errorIcon = Icons.error_outline;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  /// Fija el error distinguiendo si es por falta de conexión.
  void _setError(String genericMsg) {
    final offline = !ConnectivityService.instance.online.value;
    _error = offline
        ? 'No pudimos conectar con el servidor.\nRevisa tu conexión a internet e inténtalo de nuevo.'
        : genericMsg;
    _errorIcon = offline ? Icons.wifi_off_rounded : Icons.error_outline;
  }

  Future<void> _init() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Cargar la lista de empresas según el rol.
      if (widget.empresas != null) {
        _empresas = widget.empresas!;
      } else {
        final org = widget.contadorOrg!;
        final list = await ApiClient.instance
            .get('/api/organizations/${org.orgId}/clients') as List;
        _empresas = list
            .map((e) => ClientAccess(
                  id: e['id'] as String,
                  razonSocial: e['razonSocial'] as String,
                  rncOCedula: e['rncOCedula'] as String,
                  organizationId: org.orgId,
                  organizationNombre: org.orgNombre,
                ))
            .toList();
      }
      _selected = widget.initial ?? (_empresas.isNotEmpty ? _empresas.first : null);
      if (_selected == null) {
        setState(() {
          _error = 'No hay empresas para mostrar.';
          _loading = false;
        });
        return;
      }
      await _loadResumen();
    } catch (_) {
      if (mounted) {
        setState(() {
          _setError('No se pudo cargar la lista de empresas.');
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadResumen() async {
    final empresa = _selected!;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final json = await ApiClient.instance.get(
        '/api/organizations/${empresa.organizationId}/invoices/resumen'
        '?clientProfileId=${empresa.id}',
      ) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _data = ResumenGastos.fromJson(json);
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _setError('No se pudo cargar el resumen.');
          _loading = false;
        });
      }
    }
  }

  String _money(double v) => 'RD\$ ${v.toStringAsFixed(2).replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (m) => ',',
      )}';

  String _mesLabel(String periodo) {
    if (periodo.length != 6) return periodo;
    const meses = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
    ];
    final m = int.tryParse(periodo.substring(4, 6)) ?? 0;
    return m >= 1 && m <= 12 ? '${meses[m - 1]} ${periodo.substring(2, 4)}' : periodo;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Resumen de gastos')),
      body: Column(
        children: [
          if (_empresas.length > 1) _selector(),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _selector() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: DropdownButtonFormField<String>(
        initialValue: _selected?.id,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'Empresa',
          prefixIcon: Icon(Icons.apartment_outlined),
          border: OutlineInputBorder(),
        ),
        items: _empresas
            .map((e) => DropdownMenuItem(value: e.id, child: Text(e.razonSocial)))
            .toList(),
        onChanged: (id) {
          final e = _empresas.firstWhere((x) => x.id == id);
          setState(() => _selected = e);
          _loadResumen();
        },
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ErrorBanner(message: _error!, icon: _errorIcon),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _init,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(onRefresh: _loadResumen, child: _content(context, _data!));
  }

  Widget _content(BuildContext context, ResumenGastos d) {
    final scheme = Theme.of(context).colorScheme;
    if (d.cantidad == 0) {
      return ListView(
        children: const [
          Padding(
            padding: EdgeInsets.all(32),
            child: Text(
              'Aún no hay gastos validados para mostrar.\n'
              'Cuando tus facturas se validen, verás aquí tus totales.',
              textAlign: TextAlign.center,
            ),
          ),
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(_selected!.razonSocial, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _statCard(context, 'Total gastado', _money(d.totalGastado), Icons.payments_outlined)),
            const SizedBox(width: 12),
            Expanded(child: _statCard(context, 'ITBIS pagado', _money(d.totalItbis), Icons.receipt_long_outlined)),
          ],
        ),
        const SizedBox(height: 6),
        Text('${d.cantidad} factura(s) validada(s)',
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
        const SizedBox(height: 20),

        // Por mes
        if (d.porMes.isNotEmpty) ...[
          Text('Por mes', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 10),
          _MesChart(meses: d.porMes, label: _mesLabel, money: _money),
          const SizedBox(height: 20),
        ],

        // Por categoría
        if (d.porCategoria.isNotEmpty) ...[
          Text('Gastos por categoría', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 10),
          for (final c in d.porCategoria)
            _BarRow(
              label: c.nombre,
              value: c.total,
              max: d.porCategoria.first.total,
              valueLabel: _money(c.total),
            ),
          const SizedBox(height: 20),
        ],

        // Top proveedores
        if (d.topProveedores.isNotEmpty) ...[
          Text('Principales proveedores', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 6),
          for (final p in d.topProveedores)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(p.razonSocial),
              subtitle: Text('${p.cantidad} factura(s)'),
              trailing: Text(_money(p.total),
                  style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
        ],
      ],
    );
  }

  Widget _statCard(BuildContext context, String label, String value, IconData icon) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: scheme.primary, size: 20),
            const SizedBox(height: 8),
            Text(label, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          ],
        ),
      ),
    );
  }
}

/// Barra horizontal proporcional (categoría).
class _BarRow extends StatelessWidget {
  const _BarRow({required this.label, required this.value, required this.max, required this.valueLabel});

  final String label;
  final double value;
  final double max;
  final String valueLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final frac = max > 0 ? (value / max).clamp(0.0, 1.0) : 0.0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(label, style: const TextStyle(fontSize: 13))),
              Text(valueLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: frac,
              minHeight: 8,
              backgroundColor: scheme.surfaceContainerHighest,
              valueColor: AlwaysStoppedAnimation(scheme.primary),
            ),
          ),
        ],
      ),
    );
  }
}

/// Mini gráfico de barras por mes.
class _MesChart extends StatelessWidget {
  const _MesChart({required this.meses, required this.label, required this.money});

  final List<GastoMes> meses;
  final String Function(String) label;
  final String Function(double) money;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final max = meses.map((m) => m.total).fold<double>(0, (a, b) => b > a ? b : a);
    return SizedBox(
      height: 130,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final m in meses)
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    money(m.total).replaceAll('RD\$ ', ''),
                    style: const TextStyle(fontSize: 9),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Container(
                    height: max > 0 ? (78 * (m.total / max)).clamp(4.0, 78.0) : 4,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: scheme.primary,
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(label(m.periodo),
                      style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
