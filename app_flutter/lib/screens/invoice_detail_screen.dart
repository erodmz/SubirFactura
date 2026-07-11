import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';

/// Fecha en que se subió la factura, en hora local: "10/07/2026 · 10:16".
String _fechaSubida(DateTime dt) {
  final d = dt.toLocal();
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${dos(d.day)}/${dos(d.month)}/${d.year} · ${dos(d.hour)}:${dos(d.minute)}';
}

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

/// Tipo de identificación del 606 por longitud: 9 díg → RNC (1); 11 díg → Cédula (2).
String _tipoIdPorLongitud(String rnc) =>
    rnc.replaceAll(RegExp(r'\D'), '').length == 11 ? '2' : '1';

const _formasPago = <String, String>{
  '1': '1 · Efectivo',
  '2': '2 · Cheque / transferencia',
  '3': '3 · Tarjeta crédito/débito',
  '4': '4 · Compra a crédito',
  '5': '5 · Permuta',
  '6': '6 · Nota de crédito',
  '7': '7 · Mixto / otras',
};

const _tiposRetencionIsr = <String, String>{
  '01': '01 · Alquileres',
  '02': '02 · Honorarios por servicios',
  '03': '03 · Otras rentas',
  '04': '04 · Rentas presuntas',
  '05': '05 · Intereses pagados a PJ',
  '06': '06 · Intereses pagados a PF',
  '07': '07 · Proveedores del Estado',
  '08': '08 · Juegos de azar',
};

/// Campos requeridos para validar (resaltados si faltan tras intentar validar).
const _requeridos = {'ncf', 'rncProveedor', 'fecha', 'montoFacturado', 'itbis'};

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  Invoice? _invoice;
  String? _error;
  bool _saving = false;
  bool _intentoValidar = false;
  String _tab = 'basico';

  final _controllers = <String, TextEditingController>{};
  // Dropdowns (estado propio; los textos van por controladores).
  String? _clientProfileId;
  // Tipo de documento en un notifier: al escribir el RNC se recalcula sin
  // reconstruir toda la lista (evita saltos de scroll con el campo enfocado).
  final _tipoNotifier = ValueNotifier<String?>(null);
  String? _categoria;
  String? _tipoBienServicio;
  String? _formaPago;
  String? _tipoRetencionIsr;

  // Empresas de la organización (para el dropdown "Empresa", solo contador/admin).
  List<ClientProfile> _clientes = [];

  bool get _esCliente => widget.membership.rol == 'cliente';
  bool get _esContador => !_esCliente;
  bool get _esAdmin => widget.membership.rol == 'org_admin';

  String get _base =>
      '/api/organizations/${widget.membership.orgId}/invoices/${widget.invoiceId}';

  /// Cuántas páginas tiene la factura (para pedirlas por el proxy por índice).
  int _imageCount(Invoice invoice) => invoice.imageUrls.isNotEmpty
      ? invoice.imageUrls.length
      : (invoice.imageUrl != null ? 1 : 0);

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
    _tipoNotifier.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await ApiClient.instance.get(_base) as Map<String, dynamic>;
      final invoice = Invoice.fromJson(data);
      // Empresas para reasignar (solo el contador puede; el cliente ve la suya fija).
      if (_esContador && _clientes.isEmpty) {
        try {
          final list = await ApiClient.instance
              .get('/api/organizations/${widget.membership.orgId}/clients') as List;
          _clientes = list
              .map((e) => ClientProfile.fromJson(e as Map<String, dynamic>))
              .toList();
        } catch (_) {/* sin lista: el dropdown queda con la actual */}
      }
      if (!mounted) return;
      setState(() {
        _invoice = invoice;
        _clientProfileId = invoice.clientProfileId;
        // Normaliza a valores válidos del dropdown (evita aserciones si el backend
        // guardó algo fuera de las opciones, p.ej. tipoBienServicio 'ambos').
        _tipoNotifier.value = (invoice.tipoIdProveedor == '1' || invoice.tipoIdProveedor == '2')
            ? invoice.tipoIdProveedor
            : _tipoIdPorLongitud(invoice.rncProveedor ?? '');
        _categoria =
            categorias606.containsKey(invoice.categoria606) ? invoice.categoria606 : null;
        _tipoBienServicio = (invoice.tipoBienServicio == 'bienes' ||
                invoice.tipoBienServicio == 'servicios')
            ? invoice.tipoBienServicio
            : null;
        _formaPago = _formasPago.containsKey(invoice.formaPago) ? invoice.formaPago : null;
        _tipoRetencionIsr = _tiposRetencionIsr.containsKey(invoice.tipoRetencionIsr)
            ? invoice.tipoRetencionIsr
            : null;
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
      // Básico (1–11)
      'ncf': invoice.ncf ?? '',
      'ncfModificado': invoice.ncfModificado ?? '',
      'rncProveedor': invoice.rncProveedor ?? '',
      'razonSocialProveedor': invoice.razonSocialProveedor ?? '',
      'fecha': invoice.fecha ?? '',
      'fechaPago': invoice.fechaPago ?? '',
      'montoFacturado': fmt(invoice.montoFacturado),
      'itbis': fmt(invoice.itbis),
      'montoTotal': '',
      // Avanzado (12–23)
      'itbisRetenido': fmt(invoice.itbisRetenido),
      'itbisProporcionalidad': fmt(invoice.itbisProporcionalidad),
      'itbisCosto': fmt(invoice.itbisCosto),
      'itbisPercibido': fmt(invoice.itbisPercibido),
      'montoRetencionRenta': fmt(invoice.montoRetencionRenta),
      'isrPercibido': fmt(invoice.isrPercibido),
      'impuestoSelectivo': fmt(invoice.impuestoSelectivo),
      'otrosImpuestos': fmt(invoice.otrosImpuestos),
      'propinaLegal': fmt(invoice.propinaLegal),
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

  bool _falta(String key) =>
      _intentoValidar &&
      _requeridos.contains(key) &&
      (_controllers[key]?.text.trim().isEmpty ?? true);

  Future<void> _save({required bool validar}) async {
    setState(() {
      if (validar) _intentoValidar = true;
      _saving = true;
      _error = null;
    });
    try {
      final body = <String, dynamic>{'validar': validar};
      void putText(String key, String? value) {
        if (value != null) body[key] = value;
      }
      void putNum(String key) {
        final n = _num(key);
        if (n != null) body[key] = n;
      }

      // Texto y selects (se envían si tienen valor).
      putText('ncf', _text('ncf'));
      putText('ncfModificado', _text('ncfModificado'));
      putText('rncProveedor', _text('rncProveedor'));
      putText('razonSocialProveedor', _text('razonSocialProveedor'));
      putText('fecha', _text('fecha'));
      putText('fechaPago', _text('fechaPago'));
      putText('tipoIdProveedor', _tipoNotifier.value);
      putText('categoria606', _categoria);
      putText('tipoBienServicio', _tipoBienServicio);
      putText('formaPago', _formaPago);
      putText('tipoRetencionIsr', _tipoRetencionIsr);
      // El cliente no reasigna empresa; solo el contador/admin.
      if (_esContador) putText('clientProfileId', _clientProfileId);

      // Montos.
      for (final k in const [
        'montoFacturado', 'itbis', 'montoTotal', 'propinaLegal', 'otrosImpuestos',
        'impuestoSelectivo', 'itbisRetenido', 'itbisProporcionalidad', 'itbisCosto',
        'itbisPercibido', 'montoRetencionRenta', 'isrPercibido',
      ]) {
        putNum(k);
      }

      await ApiClient.instance.patch('$_base/review', body);
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

  Future<void> _delete() async {
    final prov = _invoice?.razonSocialProveedor ?? 'esta factura';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar factura'),
        content: Text('¿Eliminar $prov? Esta acción no se puede deshacer.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ApiClient.instance.delete(_base);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _saving = false;
        });
      }
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
                  // Cargamos por el proxy del API (host alcanzable desde el
                  // teléfono), no por la URL firmada de MinIO.
                  urls: [
                    for (var i = 0; i < _imageCount(invoice); i++)
                      ApiClient.instance.invoiceImageUrl(
                        widget.membership.orgId,
                        widget.invoiceId,
                        i,
                      ),
                  ],
                  headers: ApiClient.instance.authImageHeaders,
                ),
                if (invoice.subidoPor != null) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.person_outline,
                          size: 16, color: Theme.of(context).hintColor),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text('Subido por ${invoice.subidoPor}',
                            style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13),
                            overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 8),
                      Text(_fechaSubida(invoice.createdAt),
                          style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13)),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                // Lectura atascada: en vez de un spinner eterno, salida clara.
                // Visible para TODOS los roles (el API permite reintentar al
                // cliente sobre sus propias facturas).
                if (invoice.pareceAtascada) ...[
                  Card(
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.hourglass_bottom_outlined,
                                  size: 18,
                                  color: Theme.of(context).colorScheme.onSecondaryContainer),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'La lectura está tardando más de lo normal',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Theme.of(context).colorScheme.onSecondaryContainer,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Align(
                            alignment: Alignment.centerRight,
                            child: FilledButton.tonalIcon(
                              onPressed: _retryOcr,
                              icon: const Icon(Icons.refresh_outlined, size: 18),
                              label: const Text('Reintentar lectura'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
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
                          child: Text('NCF y RNC verificados con la DGII',
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
                // Editable en todos los estados salvo los ya incluidos en un
                // reporte (igual que el backend y el panel web).
                if (!['reportada', 'incluida_en_606'].contains(invoice.estado))
                  ..._buildForm(invoice)
                else
                  ..._buildReadOnly(invoice),
              ],
            ),
    );
  }

  List<Widget> _buildForm(Invoice invoice) {
    const numDecimal = TextInputType.numberWithOptions(decimal: true);

    Widget textField(
      String key,
      String label, {
      bool required = false,
      TextInputType? keyboard,
      String? hint,
      void Function(String)? onChanged,
    }) {
      final dudoso = invoice.camposBajaConfianza.contains(_apiFieldName(key));
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: _controllers[key],
          keyboardType: keyboard,
          onChanged: onChanged,
          decoration: InputDecoration(
            labelText: required ? '$label *' : label,
            hintText: hint,
            border: const OutlineInputBorder(),
            errorText: _falta(key) ? 'Requerido para validar' : null,
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

    Widget dropdown(
      String label,
      String? value,
      Map<String, String> options,
      void Function(String?) onChanged, {
      String? placeholder,
      bool controlled = false,
    }) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: DropdownButtonFormField<String>(
          // Cuando el valor cambia por código (p.ej. tipo por longitud), la key
          // fuerza el refresco del valor mostrado.
          key: controlled ? ValueKey('$label-$value') : null,
          initialValue: value,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
          ),
          items: [
            if (placeholder != null)
              DropdownMenuItem(value: null, child: Text(placeholder)),
            for (final e in options.entries)
              DropdownMenuItem(value: e.key, child: Text(e.value)),
          ],
          onChanged: onChanged,
        ),
      );
    }

    return [
      SegmentedButton<String>(
        segments: const [
          ButtonSegment(value: 'basico', label: Text('Datos básicos')),
          ButtonSegment(value: 'avanzado', label: Text('Retenciones')),
        ],
        selected: {_tab},
        showSelectedIcon: false,
        onSelectionChanged: (s) => setState(() => _tab = s.first),
      ),
      const SizedBox(height: 16),
      if (_tab == 'basico') ...[
        // Empresa: solo el contador puede reasignar; el cliente ve su factura fija.
        if (_esContador)
          dropdown(
            'Empresa (cliente)',
            _clientProfileId,
            {
              for (final c in _clientes) c.id: c.razonSocial,
              // Garantiza que la empresa actual esté en la lista aunque el fetch falle.
              if (_clientProfileId != null &&
                  !_clientes.any((c) => c.id == _clientProfileId))
                _clientProfileId!: invoice.clientRazonSocial ?? 'Empresa actual',
            },
            (v) => setState(() => _clientProfileId = v),
            placeholder: '— Sin asignar —',
          ),
        textField(
          'rncProveedor',
          'RNC / Cédula del proveedor',
          required: true,
          keyboard: TextInputType.number,
          // Solo actualiza el notifier (sin setState): no reconstruye la lista.
          onChanged: (v) => _tipoNotifier.value = _tipoIdPorLongitud(v),
        ),
        ValueListenableBuilder<String?>(
          valueListenable: _tipoNotifier,
          builder: (_, tipo, __) => dropdown(
            'Tipo de documento',
            tipo,
            const {'1': '1 · RNC (9 dígitos)', '2': '2 · Cédula (11 dígitos)'},
            (v) => _tipoNotifier.value = v,
            controlled: true,
          ),
        ),
        textField('razonSocialProveedor', 'Razón social del proveedor'),
        dropdown(
          'Tipo de bienes/servicios (606)',
          _categoria,
          {for (final e in categorias606.entries) e.key: '${e.key} · ${e.value}'},
          (v) => setState(() => _categoria = v),
          placeholder: 'Sin asignar',
        ),
        dropdown(
          'Bienes o servicios',
          _tipoBienServicio,
          const {'bienes': 'Bienes', 'servicios': 'Servicios'},
          (v) => setState(() => _tipoBienServicio = v),
          placeholder: 'Sin especificar',
        ),
        textField('ncf', 'NCF', required: true, hint: 'B0100000001'),
        textField('ncfModificado', 'NCF modificado (nota créd./déb.)'),
        textField('fecha', 'Fecha comprobante (AAAA-MM-DD)',
            required: true, keyboard: TextInputType.datetime, hint: '2026-05-14'),
        textField('fechaPago', 'Fecha de pago (AAAA-MM-DD)',
            keyboard: TextInputType.datetime, hint: 'opcional'),
        textField('montoFacturado', 'Monto facturado (subtotal)',
            required: true, keyboard: numDecimal),
        textField('itbis', 'ITBIS facturado', required: true, keyboard: numDecimal),
        dropdown(
          'Forma de pago',
          _formaPago,
          _formasPago,
          (v) => setState(() => _formaPago = v),
          placeholder: 'Sin especificar',
        ),
        textField('montoTotal', 'Total impreso (verifica aritmética)',
            keyboard: numDecimal),
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 4),
          child: Text('* Campos requeridos para validar.',
              style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
        ),
      ] else ...[
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text('Columnas avanzadas del 606. Déjalas en blanco si no aplican.',
              style: TextStyle(color: Theme.of(context).hintColor)),
        ),
        textField('itbisRetenido', 'ITBIS retenido', keyboard: numDecimal),
        textField('itbisProporcionalidad', 'ITBIS proporcionalidad (Art. 349)',
            keyboard: numDecimal),
        textField('itbisCosto', 'ITBIS llevado al costo', keyboard: numDecimal),
        textField('itbisPercibido', 'ITBIS percibido', keyboard: numDecimal),
        dropdown(
          'Tipo de retención en ISR',
          _tipoRetencionIsr,
          _tiposRetencionIsr,
          (v) => setState(() => _tipoRetencionIsr = v),
          placeholder: 'Sin retención',
        ),
        textField('montoRetencionRenta', 'Monto retención renta', keyboard: numDecimal),
        textField('isrPercibido', 'ISR percibido', keyboard: numDecimal),
        textField('impuestoSelectivo', 'Impuesto selectivo al consumo',
            keyboard: numDecimal),
        textField('otrosImpuestos', 'Otros impuestos / tasas', keyboard: numDecimal),
        textField('propinaLegal', 'Propina legal', keyboard: numDecimal),
      ],
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
                child: Text(_saving ? 'Guardando…' : 'Validar'),
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
      // Eliminar: solo administrador (irreversible).
      if (_esAdmin) ...[
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _saving ? null : _delete,
            icon: const Icon(Icons.delete_outline, color: Colors.red),
            label: const Text('Eliminar factura', style: TextStyle(color: Colors.red)),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.all(14),
              side: const BorderSide(color: Colors.red),
            ),
          ),
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
  const _PhotoViewer({required this.url, this.headers});

  final String url;
  final Map<String, String>? headers;

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
              headers: widget.headers,
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
  const _InvoiceImages({required this.urls, this.headers});

  final List<String> urls;
  final Map<String, String>? headers;

  void _open(BuildContext context, String url) {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _PhotoViewer(url: url, headers: headers),
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
                headers: headers,
                height: 260,
                width: double.infinity,
                fit: BoxFit.cover,
                // Decodifica a tamaño de pantalla (no a resolución completa):
                // evita jank de decodificación al hacer scroll.
                cacheWidth: 1080,
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
                      headers: headers,
                      width: 160,
                      height: 220,
                      fit: BoxFit.cover,
                      cacheWidth: 400,
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
