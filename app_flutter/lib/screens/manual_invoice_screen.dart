import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../widgets/error_banner.dart';

/// Registro MANUAL de un gasto — para cuando no hay comprobante que
/// fotografiar. Si hay foto, mejor el flujo normal: la IA la lee.
/// Entra en revisión; con permiso (y sin workflow de aprobación del cliente)
/// puede validarse al guardar.
class ManualInvoiceScreen extends StatefulWidget {
  const ManualInvoiceScreen({
    super.key,
    required this.orgId,
    this.fixedClientId,
    this.fixedClientName,
    this.canValidar = false,
  });

  final String orgId;

  /// Cliente fijo (vista del dueño de negocio); null = selector (contador).
  final String? fixedClientId;
  final String? fixedClientName;

  /// Quien registra puede validar al guardar (contador / cliente de confianza).
  final bool canValidar;

  @override
  State<ManualInvoiceScreen> createState() => _ManualInvoiceScreenState();
}

class _ManualInvoiceScreenState extends State<ManualInvoiceScreen> {
  final _rnc = TextEditingController();
  final _razonSocial = TextEditingController();
  final _ncf = TextEditingController();
  final _subtotal = TextEditingController();
  final _itbis = TextEditingController();
  final _total = TextEditingController();

  List<Map<String, dynamic>> _clientes = [];
  String? _clientId;
  String? _categoria606;
  DateTime? _fecha;
  bool _validar = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _clientId = widget.fixedClientId;
    if (widget.fixedClientId == null) _loadClientes();
  }

  @override
  void dispose() {
    _rnc.dispose();
    _razonSocial.dispose();
    _ncf.dispose();
    _subtotal.dispose();
    _itbis.dispose();
    _total.dispose();
    super.dispose();
  }

  Future<void> _loadClientes() async {
    try {
      final data =
          await ApiClient.instance.get('/api/organizations/${widget.orgId}/clients') as List;
      if (!mounted) return;
      setState(() => _clientes = data.cast<Map<String, dynamic>>());
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudieron cargar los clientes');
    }
  }

  double? _num(TextEditingController c) {
    final t = c.text.trim().replaceAll(',', '');
    return t.isEmpty ? null : double.tryParse(t);
  }

  Future<void> _guardar() async {
    if (_clientId == null) {
      setState(() => _error = 'Indica a qué negocio pertenece el gasto');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.post(
        '/api/organizations/${widget.orgId}/invoices/manual',
        {
          'clientProfileId': _clientId,
          if (_rnc.text.trim().isNotEmpty) 'rncProveedor': _rnc.text.trim(),
          if (_razonSocial.text.trim().isNotEmpty)
            'razonSocialProveedor': _razonSocial.text.trim(),
          if (_ncf.text.trim().isNotEmpty) 'ncf': _ncf.text.trim(),
          if (_fecha != null)
            'fecha': _fecha!.toIso8601String().substring(0, 10),
          if (_num(_subtotal) != null) 'montoFacturado': _num(_subtotal),
          if (_num(_itbis) != null) 'itbis': _num(_itbis),
          if (_num(_total) != null) 'montoTotal': _num(_total),
          if (_categoria606 != null) 'categoria606': _categoria606,
          if (_validar) 'validar': true,
        },
      ) as Map<String, dynamic>;
      if (!mounted) return;
      final aviso = res['aprobacionRequerida'] == true
          ? 'Este negocio exige aprobación: el gasto quedó en revisión'
          : res['estado'] == 'validada'
              ? 'Gasto registrado y validado'
              : 'Gasto registrado — quedó en revisión';
      Navigator.of(context).pop(aviso);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Sin conexión. Intenta de nuevo.';
        });
      }
    }
  }

  Future<void> _pickFecha() async {
    final hoy = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _fecha ?? hoy,
      firstDate: DateTime(hoy.year - 2),
      lastDate: hoy,
    );
    if (picked != null) setState(() => _fecha = picked);
  }

  InputDecoration _dec(String label, {String? hint}) =>
      InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder());

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Registrar gasto a mano')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.primaryContainer.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(Icons.lightbulb_outline, color: scheme.primary),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      '¿Tienes el comprobante a mano? Mejor fotografíalo: la IA lo lee. '
                      'Esto es para cuando no hay nada que fotografiar.',
                      style: TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_error != null) ...[
              ErrorBanner(message: _error!),
              const SizedBox(height: 12),
            ],
            if (widget.fixedClientId != null)
              InputDecorator(
                decoration: _dec('Negocio'),
                child: Text(widget.fixedClientName ?? ''),
              )
            else
              DropdownButtonFormField<String>(
                initialValue: _clientId,
                decoration: _dec('Negocio (cliente)'),
                items: _clientes
                    .map((c) => DropdownMenuItem(
                          value: c['id'] as String,
                          child: Text(c['razonSocial'] as String? ?? '—'),
                        ))
                    .toList(),
                onChanged: (v) => setState(() => _clientId = v),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _rnc,
              decoration: _dec('RNC del proveedor', hint: '101000001'),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _razonSocial,
              decoration: _dec('Nombre del proveedor (opcional)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _ncf,
              decoration: _dec('NCF', hint: 'B0100000001'),
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: _pickFecha,
              borderRadius: BorderRadius.circular(4),
              child: InputDecorator(
                decoration: _dec('Fecha').copyWith(
                  suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18),
                ),
                child: Text(
                  _fecha == null
                      ? 'Toca para elegir'
                      : _fecha!.toIso8601String().substring(0, 10),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _subtotal,
                    decoration: _dec('Subtotal (sin ITBIS)'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _itbis,
                    decoration: _dec('ITBIS'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _total,
              decoration: _dec('Total (como en el comprobante)'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _categoria606,
              isExpanded: true,
              decoration: _dec('Categoría del gasto (606)'),
              hint: const Text('Sin clasificar (el contador la asigna)'),
              items: [
                for (final e in categorias606.entries)
                  DropdownMenuItem(value: e.key, child: Text('${e.key} · ${e.value}')),
              ],
              onChanged: (v) => setState(() => _categoria606 = v),
            ),
            // Validar sin categoría deja la factura verde pero fuera del 606.
            if (widget.canValidar && _validar && _categoria606 == null) ...[
              const SizedBox(height: 6),
              Text(
                'Sin categoría, esta factura no entrará al 606 aunque quede validada.',
                style: TextStyle(fontSize: 12.5, color: scheme.error),
              ),
            ],
            if (widget.canValidar) ...[
              const SizedBox(height: 6),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Validar al guardar'),
                subtitle: const Text('Exige NCF, RNC, fecha, montos y que cuadren'),
                value: _validar,
                onChanged: (v) => setState(() => _validar = v),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'Puedes guardar con lo que tengas: queda en revisión y el contador la completa.',
              style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : _guardar,
              icon: _busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.edit_note_outlined),
              label: Text(_busy ? 'Guardando…' : 'Guardar gasto'),
            ),
          ],
        ),
      ),
    );
  }
}
