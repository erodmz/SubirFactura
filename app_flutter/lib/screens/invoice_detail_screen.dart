import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';

/// Detalle de factura + cola de revisión con edición campo a campo (§5.3).
/// Los campos que la IA marcó como dudosos se resaltan para corregirlos.
class InvoiceDetailScreen extends StatefulWidget {
  const InvoiceDetailScreen({
    super.key,
    required this.membership,
    required this.invoiceId,
  });

  final Membership membership;
  final String invoiceId;

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  Invoice? _invoice;
  String? _error;
  bool _saving = false;

  final _controllers = <String, TextEditingController>{};
  String? _categoria;

  String get _base =>
      '/api/organizations/${widget.membership.orgId}/invoices/${widget.invoiceId}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await ApiClient.instance.get(_base) as Map<String, dynamic>;
      final invoice = Invoice.fromJson(data);
      if (!mounted) return;
      setState(() {
        _invoice = invoice;
        _categoria = invoice.categoria606;
        _error = null;
      });
      _initControllers(invoice);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _initControllers(Invoice invoice) {
    String fmt(double? value) => value?.toStringAsFixed(2) ?? '';
    final values = {
      'ncf': invoice.ncf ?? '',
      'rncProveedor': invoice.rncProveedor ?? '',
      'razonSocialProveedor': invoice.razonSocialProveedor ?? '',
      'fecha': invoice.fecha ?? '',
      'montoFacturado': fmt(invoice.montoFacturado),
      'itbis': fmt(invoice.itbis),
      'propinaLegal': fmt(invoice.propinaLegal),
      'montoTotal': '',
    };
    values.forEach((key, value) {
      _controllers.putIfAbsent(key, TextEditingController.new).text = value;
    });
  }

  double? _num(String key) {
    final text = _controllers[key]?.text.trim() ?? '';
    return text.isEmpty ? null : double.tryParse(text.replaceAll(',', ''));
  }

  String? _text(String key) {
    final text = _controllers[key]?.text.trim() ?? '';
    return text.isEmpty ? null : text;
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ApiClient.instance.patch('$_base/review', {
        if (_text('ncf') != null) 'ncf': _text('ncf'),
        if (_text('rncProveedor') != null) 'rncProveedor': _text('rncProveedor'),
        if (_text('razonSocialProveedor') != null)
          'razonSocialProveedor': _text('razonSocialProveedor'),
        if (_text('fecha') != null) 'fecha': _text('fecha'),
        if (_num('montoFacturado') != null) 'montoFacturado': _num('montoFacturado'),
        if (_num('itbis') != null) 'itbis': _num('itbis'),
        if (_num('propinaLegal') != null) 'propinaLegal': _num('propinaLegal'),
        if (_num('montoTotal') != null) 'montoTotal': _num('montoTotal'),
        if (_categoria != null) 'categoria606': _categoria,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Factura validada')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _retryOcr() async {
    try {
      await ApiClient.instance.post('$_base/retry');
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Reprocesando con IA…')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final invoice = _invoice;
    return Scaffold(
      appBar: AppBar(
        title: Text(invoice == null
            ? 'Factura'
            : estadoLabels[invoice.estado] ?? invoice.estado),
        actions: [
          if (invoice != null &&
              widget.membership.rol != 'cliente' &&
              ['subida', 'en_revision', 'procesando'].contains(invoice.estado))
            IconButton(
              onPressed: _retryOcr,
              icon: const Icon(Icons.auto_awesome),
              tooltip: 'Reprocesar con IA',
            ),
        ],
      ),
      body: invoice == null
          ? Center(
              child: _error == null ? const CircularProgressIndicator() : Text(_error!),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (invoice.imageUrl != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(
                      invoice.imageUrl!,
                      height: 260,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox(
                        height: 80,
                        child: Center(child: Text('No se pudo cargar la imagen')),
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                if (invoice.erroresValidacion.isNotEmpty)
                  Card(
                    color: Colors.orange.shade50,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Por revisar:',
                              style: TextStyle(fontWeight: FontWeight.bold)),
                          for (final error in invoice.erroresValidacion) Text('• $error'),
                        ],
                      ),
                    ),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(_error!, style: const TextStyle(color: Colors.red)),
                  ),
                if (invoice.estado == 'en_revision' || invoice.estado == 'extraida')
                  ..._buildForm(invoice)
                else
                  ..._buildReadOnly(invoice),
              ],
            ),
    );
  }

  List<Widget> _buildForm(Invoice invoice) {
    Widget field(String key, String label, {TextInputType? keyboard, String? hint}) {
      final dudoso = invoice.camposBajaConfianza.contains(_apiFieldName(key));
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: _controllers[key],
          keyboardType: keyboard,
          decoration: InputDecoration(
            labelText: label,
            hintText: hint,
            border: const OutlineInputBorder(),
            suffixIcon: dudoso
                ? const Tooltip(
                    message: 'La IA no está segura de este campo: verifícalo',
                    child: Icon(Icons.warning_amber, color: Colors.orange),
                  )
                : null,
          ),
        ),
      );
    }

    return [
      const Text('Corrige y confirma los datos:',
          style: TextStyle(fontWeight: FontWeight.bold)),
      const SizedBox(height: 12),
      field('ncf', 'NCF', hint: 'B0100000123'),
      field('rncProveedor', 'RNC del proveedor', keyboard: TextInputType.number),
      field('razonSocialProveedor', 'Razón social del proveedor'),
      field('fecha', 'Fecha (AAAA-MM-DD)', keyboard: TextInputType.datetime),
      field('montoFacturado', 'Subtotal sin impuestos',
          keyboard: const TextInputType.numberWithOptions(decimal: true)),
      field('itbis', 'ITBIS',
          keyboard: const TextInputType.numberWithOptions(decimal: true)),
      field('propinaLegal', 'Propina legal (10%)',
          keyboard: const TextInputType.numberWithOptions(decimal: true)),
      field('montoTotal', 'Total impreso (para verificar montos)',
          keyboard: const TextInputType.numberWithOptions(decimal: true)),
      DropdownButtonFormField<String>(
        value: _categoria,
        decoration: const InputDecoration(
          labelText: 'Categoría de gasto (606)',
          border: OutlineInputBorder(),
        ),
        items: [
          for (final entry in categorias606.entries)
            DropdownMenuItem(value: entry.key, child: Text('${entry.key} · ${entry.value}')),
        ],
        onChanged: (value) => setState(() => _categoria = value),
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: _saving ? null : _save,
        style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
        child: Text(_saving ? 'Guardando…' : 'Confirmar datos'),
      ),
      const SizedBox(height: 32),
    ];
  }

  List<Widget> _buildReadOnly(Invoice invoice) {
    Widget row(String label, String? value) => value == null
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 130,
                  child: Text(label, style: const TextStyle(color: Colors.grey)),
                ),
                Expanded(child: Text(value)),
              ],
            ),
          );

    String? money(double? value) => value == null ? null : 'RD\$ ${value.toStringAsFixed(2)}';

    return [
      row('Proveedor', invoice.razonSocialProveedor),
      row('NCF', invoice.ncf),
      row('RNC', invoice.rncProveedor),
      row('Fecha', invoice.fecha),
      row('Subtotal', money(invoice.montoFacturado)),
      row('ITBIS', money(invoice.itbis)),
      row('Propina', money(invoice.propinaLegal)),
      row('Categoría 606',
          invoice.categoria606 == null ? null : categorias606[invoice.categoria606!]),
      row('Período fiscal', invoice.periodoFiscal),
    ];
  }

  /// La UI usa claves camelCase; la evaluación del worker usa las del contrato JSON.
  String _apiFieldName(String key) => switch (key) {
        'rncProveedor' => 'rnc_proveedor',
        'montoFacturado' => 'monto_facturado',
        _ => key,
      };
}
