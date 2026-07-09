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
    this.canValidate = true,
  });

  final Membership membership;
  final String invoiceId;

  /// Si es false (cliente sin permiso), solo puede Guardar, no Validar.
  final bool canValidate;

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

  Future<void> _save({required bool validar}) async {
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
        'validar': validar,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(validar ? 'Factura validada' : 'Cambios guardados')),
      );
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

  Future<void> _changeStatus(String estado) async {
    try {
      await ApiClient.instance.patch('$_base/estado', {'estado': estado});
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Estado: ${estadoLabels[estado] ?? estado}')));
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
              icon: const Icon(Icons.auto_awesome_outlined),
              tooltip: 'Reprocesar con IA',
            ),
          // Corregir el estado manualmente (contador); no si ya está en un reporte.
          if (invoice != null &&
              widget.membership.rol != 'cliente' &&
              !['reportada', 'incluida_en_606'].contains(invoice.estado))
            PopupMenuButton<String>(
              tooltip: 'Cambiar estado',
              icon: const Icon(Icons.more_vert),
              onSelected: _changeStatus,
              itemBuilder: (context) => const [
                PopupMenuItem(
                  enabled: false,
                  child: Text('Cambiar estado', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
                PopupMenuItem(value: 'en_revision', child: Text('En revisión')),
                PopupMenuItem(value: 'validada', child: Text('Validada')),
                PopupMenuItem(value: 'rechazada', child: Text('Rechazada')),
              ],
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
                _InvoiceImages(
                  urls: invoice.imageUrls.isNotEmpty
                      ? invoice.imageUrls
                      : [if (invoice.imageUrl != null) invoice.imageUrl!],
                ),
                if (invoice.subidoPor != null) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.person_outline,
                          size: 16, color: Theme.of(context).hintColor),
                      const SizedBox(width: 6),
                      Text('Subido por ${invoice.subidoPor}',
                          style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13)),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                if (invoice.erroresValidacion.isNotEmpty)
                  Card(
                    color: Theme.of(context).colorScheme.tertiaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: DefaultTextStyle.merge(
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onTertiaryContainer,
                        ),
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
                  ),
                if (invoice.alertasDgii.isNotEmpty)
                  Card(
                    color: Theme.of(context).colorScheme.errorContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: DefaultTextStyle.merge(
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onErrorContainer,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Revisa antes de reportar a la DGII:',
                                style: TextStyle(fontWeight: FontWeight.bold)),
                            for (final a in invoice.alertasDgii) Text('• $a'),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (invoice.validacionDgiiOk)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        const Icon(Icons.verified_outlined, color: Colors.green, size: 18),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text('NCF, RNC y padrón DGII verificados',
                              style: TextStyle(color: Colors.green.shade700, fontSize: 13)),
                        ),
                      ],
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
      if (widget.canValidate)
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _saving ? null : () => _save(validar: false),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.all(16)),
                child: const Text('Guardar'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: _saving ? null : () => _save(validar: true),
                style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
                child: Text(_saving ? 'Guardando…' : 'Guardar y validar'),
              ),
            ),
          ],
        )
      else ...[
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _saving ? null : () => _save(validar: false),
            style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
            child: Text(_saving ? 'Guardando…' : 'Guardar'),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Tu contador revisará y validará esta factura.',
          style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor),
        ),
      ],
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

/// Visor de imagen a pantalla completa con zoom de pellizco, paneo y doble-tap.
class _PhotoViewer extends StatefulWidget {
  const _PhotoViewer({required this.url});

  final String url;

  @override
  State<_PhotoViewer> createState() => _PhotoViewerState();
}

class _PhotoViewerState extends State<_PhotoViewer> {
  final _controller = TransformationController();
  TapDownDetails? _doubleTapDetails;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleDoubleTap() {
    if (_controller.value != Matrix4.identity()) {
      _controller.value = Matrix4.identity(); // ya con zoom → restablecer
    } else {
      final pos = _doubleTapDetails!.localPosition;
      _controller.value = Matrix4.identity()
        ..translate(-pos.dx * 1.5, -pos.dy * 1.5)
        ..scale(2.5);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('Factura', style: TextStyle(color: Colors.white)),
      ),
      body: GestureDetector(
        onDoubleTapDown: (d) => _doubleTapDetails = d,
        onDoubleTap: _handleDoubleTap,
        child: InteractiveViewer(
          transformationController: _controller,
          minScale: 1,
          maxScale: 5,
          child: Center(
            child: Image.network(
              widget.url,
              fit: BoxFit.contain,
              loadingBuilder: (context, child, progress) => progress == null
                  ? child
                  : const Center(child: CircularProgressIndicator(color: Colors.white)),
              errorBuilder: (_, __, ___) => const Center(
                child: Text('No se pudo cargar la imagen',
                    style: TextStyle(color: Colors.white)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Muestra las páginas de la factura. Una imagen → vista grande; varias →
/// tira horizontal numerada. Cualquier página se toca para ampliar con zoom.
class _InvoiceImages extends StatelessWidget {
  const _InvoiceImages({required this.urls});

  final List<String> urls;

  void _open(BuildContext context, String url) {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _PhotoViewer(url: url),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (urls.isEmpty) return const SizedBox.shrink();

    if (urls.length == 1) {
      return GestureDetector(
        onTap: () => _open(context, urls.first),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Stack(
            children: [
              Image.network(
                urls.first,
                height: 260,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox(
                  height: 80,
                  child: Center(child: Text('No se pudo cargar la imagen')),
                ),
              ),
              const Positioned(right: 8, bottom: 8, child: _ZoomBadge()),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text('${urls.length} páginas · toca para ampliar',
              style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
        ),
        SizedBox(
          height: 220,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: urls.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) => GestureDetector(
              onTap: () => _open(context, urls[i]),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Stack(
                  children: [
                    Image.network(
                      urls[i],
                      width: 160,
                      height: 220,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox(
                        width: 160,
                        child: Center(child: Text('Error')),
                      ),
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
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ZoomBadge extends StatelessWidget {
  const _ZoomBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.zoom_in, color: Colors.white, size: 16),
          SizedBox(width: 4),
          Text('Ampliar', style: TextStyle(color: Colors.white, fontSize: 12)),
        ],
      ),
    );
  }
}
