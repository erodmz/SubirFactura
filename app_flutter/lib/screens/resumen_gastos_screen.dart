import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';

/// Resumen de gastos de un negocio: total, ITBIS, por categoría, por mes y
/// principales proveedores. Da valor al cliente, no solo al contador.
class ResumenGastosScreen extends StatefulWidget {
  const ResumenGastosScreen({super.key, required this.client});

  final ClientAccess client;

  @override
  State<ResumenGastosScreen> createState() => _ResumenGastosScreenState();
}

class _ResumenGastosScreenState extends State<ResumenGastosScreen> {
  ResumenGastos? _data;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final json = await ApiClient.instance.get(
        '/api/organizations/${widget.client.organizationId}/invoices/resumen'
        '?clientProfileId=${widget.client.id}',
      ) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _data = ResumenGastos.fromJson(json);
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudo cargar el resumen';
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
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: _load, child: const Text('Reintentar')),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _content(context, _data!),
                ),
    );
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
        Text(widget.client.razonSocial,
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _statCard(context, 'Total gastado', _money(d.totalGastado), Icons.payments)),
            const SizedBox(width: 12),
            Expanded(child: _statCard(context, 'ITBIS pagado', _money(d.totalItbis), Icons.receipt_long)),
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
