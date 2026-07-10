/// Modelos del API. Prisma serializa los Decimal como string: usar [parseNum].
library;

double? parseNum(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

class Me {
  Me({
    required this.userId,
    required this.email,
    required this.nombre,
    required this.isSuperAdmin,
    required this.memberships,
    required this.clientProfiles,
  });

  factory Me.fromJson(Map<String, dynamic> json) => Me(
        userId: json['userId'] as String,
        email: json['email'] as String,
        nombre: json['nombre'] as String?,
        isSuperAdmin: json['isSuperAdmin'] as bool? ?? false,
        memberships: (json['memberships'] as List)
            .map((e) => Membership.fromJson(e as Map<String, dynamic>))
            .toList(),
        clientProfiles: ((json['clientProfiles'] as List?) ?? [])
            .map((e) => ClientAccess.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final String userId;
  final String email;
  final String? nombre;
  final bool isSuperAdmin;
  final List<Membership> memberships;

  /// Negocios (client_profiles) que el usuario puede subir como cliente.
  final List<ClientAccess> clientProfiles;

  /// Despachos donde administra/contabiliza (no incluye rol cliente).
  List<Membership> get contadorMemberships =>
      memberships.where((m) => m.rol != 'cliente').toList();

  /// ¿Puede validar facturas en esta org? Contador/admin siempre; cliente solo
  /// si el contador se lo habilitó.
  bool canValidateInOrg(String orgId) => memberships
      .where((m) => m.orgId == orgId)
      .any((m) => m.rol != 'cliente' || m.puedeValidar);

  /// ¿Puede ver el resumen de gastos en esta org? Contador/admin siempre; el
  /// cliente solo si el contador se lo habilitó.
  bool canViewReportsInOrg(String orgId) => memberships
      .where((m) => m.orgId == orgId)
      .any((m) => m.rol != 'cliente' || m.puedeVerReportes);

  String get displayName => nombre?.isNotEmpty == true ? nombre! : email;

  String get initials {
    final n = nombre?.trim();
    if (n != null && n.isNotEmpty) {
      final parts = n.split(RegExp(r'\s+'));
      return (parts[0][0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
    }
    return email.substring(0, email.length >= 2 ? 2 : 1).toUpperCase();
  }
}

class Membership {
  Membership({
    required this.membershipId,
    required this.rol,
    required this.orgId,
    required this.orgNombre,
    this.puedeValidar = false,
    this.puedeVerReportes = false,
    this.orgLogoUrl,
  });

  factory Membership.fromJson(Map<String, dynamic> json) {
    final org = json['organization'] as Map<String, dynamic>;
    return Membership(
      membershipId: json['membershipId'] as String,
      rol: json['rol'] as String,
      orgId: org['id'] as String,
      orgNombre: org['nombre'] as String,
      puedeValidar: json['puedeValidar'] as bool? ?? false,
      puedeVerReportes: json['puedeVerReportes'] as bool? ?? false,
      orgLogoUrl: org['logoUrl'] as String?,
    );
  }

  final String membershipId;
  final String rol;
  final String orgId;
  final String orgNombre;

  /// El contador habilitó a este cliente para validar (no solo guardar).
  final bool puedeValidar;

  /// El contador habilitó a este cliente para ver el resumen de gastos.
  final bool puedeVerReportes;

  /// Logo de la empresa (si lo subió), para la lista de empresas.
  final String? orgLogoUrl;
}

/// Un negocio (client_profile) al que un cliente puede subirle facturas,
/// con el despacho (organización) al que pertenece.
class ClientAccess {
  ClientAccess({
    required this.id,
    required this.razonSocial,
    required this.rncOCedula,
    required this.organizationId,
    required this.organizationNombre,
  });

  factory ClientAccess.fromJson(Map<String, dynamic> json) => ClientAccess(
        id: json['id'] as String,
        razonSocial: json['razonSocial'] as String,
        rncOCedula: json['rncOCedula'] as String,
        organizationId: json['organizationId'] as String,
        organizationNombre: json['organizationNombre'] as String,
      );

  final String id;
  final String razonSocial;
  final String rncOCedula;
  final String organizationId;
  final String organizationNombre;
}

/// Resumen de gastos de un negocio (analítica para el cliente).
class ResumenGastos {
  ResumenGastos({
    required this.totalGastado,
    required this.totalItbis,
    required this.cantidad,
    required this.porCategoria,
    required this.porMes,
    required this.topProveedores,
  });

  factory ResumenGastos.fromJson(Map<String, dynamic> json) => ResumenGastos(
        totalGastado: (json['totalGastado'] as num?)?.toDouble() ?? 0,
        totalItbis: (json['totalItbis'] as num?)?.toDouble() ?? 0,
        cantidad: json['cantidad'] as int? ?? 0,
        porCategoria: ((json['porCategoria'] as List?) ?? [])
            .map((e) => GastoCategoria.fromJson(e as Map<String, dynamic>))
            .toList(),
        porMes: ((json['porMes'] as List?) ?? [])
            .map((e) => GastoMes.fromJson(e as Map<String, dynamic>))
            .toList(),
        topProveedores: ((json['topProveedores'] as List?) ?? [])
            .map((e) => GastoProveedor.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final double totalGastado;
  final double totalItbis;
  final int cantidad;
  final List<GastoCategoria> porCategoria;
  final List<GastoMes> porMes;
  final List<GastoProveedor> topProveedores;
}

class GastoCategoria {
  GastoCategoria({required this.nombre, required this.total, required this.cantidad});
  factory GastoCategoria.fromJson(Map<String, dynamic> j) => GastoCategoria(
        nombre: j['nombre'] as String? ?? '—',
        total: (j['total'] as num?)?.toDouble() ?? 0,
        cantidad: j['cantidad'] as int? ?? 0,
      );
  final String nombre;
  final double total;
  final int cantidad;
}

class GastoMes {
  GastoMes({required this.periodo, required this.total, required this.itbis, required this.cantidad});
  factory GastoMes.fromJson(Map<String, dynamic> j) => GastoMes(
        periodo: j['periodo'] as String? ?? '',
        total: (j['total'] as num?)?.toDouble() ?? 0,
        itbis: (j['itbis'] as num?)?.toDouble() ?? 0,
        cantidad: j['cantidad'] as int? ?? 0,
      );
  final String periodo;
  final double total;
  final double itbis;
  final int cantidad;
}

class GastoProveedor {
  GastoProveedor({required this.razonSocial, required this.total, required this.cantidad});
  factory GastoProveedor.fromJson(Map<String, dynamic> j) => GastoProveedor(
        razonSocial: j['razonSocial'] as String? ?? '—',
        total: (j['total'] as num?)?.toDouble() ?? 0,
        cantidad: j['cantidad'] as int? ?? 0,
      );
  final String razonSocial;
  final double total;
  final int cantidad;
}

class ClientProfile {
  ClientProfile({required this.id, required this.razonSocial, required this.rncOCedula});

  factory ClientProfile.fromJson(Map<String, dynamic> json) => ClientProfile(
        id: json['id'] as String,
        razonSocial: json['razonSocial'] as String,
        rncOCedula: json['rncOCedula'] as String,
      );

  final String id;
  final String razonSocial;
  final String rncOCedula;
}

class Invoice {
  Invoice({
    required this.id,
    required this.estado,
    required this.createdAt,
    this.updatedAt,
    this.clientProfileId,
    this.clientRazonSocial,
    this.ncf,
    this.rncProveedor,
    this.tipoIdProveedor,
    this.razonSocialProveedor,
    this.fecha,
    this.fechaPago,
    this.montoFacturado,
    this.itbis,
    this.propinaLegal,
    this.otrosImpuestos,
    this.impuestoSelectivo,
    this.categoria606,
    this.tipoComprobante,
    this.tipoBienServicio,
    this.formaPago,
    this.ncfModificado,
    this.periodoFiscal,
    // Retenciones e impuestos (col. 12–23)
    this.itbisRetenido,
    this.itbisProporcionalidad,
    this.itbisCosto,
    this.itbisPercibido,
    this.tipoRetencionIsr,
    this.montoRetencionRenta,
    this.isrPercibido,
    this.imageUrl,
    this.imageUrls = const [],
    this.camposBajaConfianza = const [],
    this.erroresValidacion = const [],
    this.alertasDgii = const [],
    this.validacionDgiiOk = false,
    this.subidoPor,
  });

  factory Invoice.fromJson(Map<String, dynamic> json) {
    final client = json['clientProfile'] as Map<String, dynamic>?;
    final subido = json['subidoPor'] as Map<String, dynamic>?;
    final confianza = json['confianzaPorCampo'] as Map<String, dynamic>?;
    final evaluation = confianza?['evaluation'] as Map<String, dynamic>?;
    final errores = <String>[
      ...?(evaluation?['erroresValidacion'] as List?)?.cast<String>(),
      if (confianza?['error'] is String) confianza!['error'] as String,
    ];
    final validacion = json['validacionDgii'] as Map<String, dynamic>?;
    String? fechaCorta(dynamic v) => (v as String?)?.substring(0, 10);
    return Invoice(
      id: json['id'] as String,
      estado: json['estado'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: json['updatedAt'] is String
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
      clientProfileId: client?['id'] as String?,
      clientRazonSocial: client?['razonSocial'] as String?,
      ncf: json['ncf'] as String?,
      rncProveedor: json['rncProveedor'] as String?,
      tipoIdProveedor: json['tipoIdProveedor'] as String?,
      razonSocialProveedor: json['razonSocialProveedor'] as String?,
      fecha: fechaCorta(json['fecha']),
      fechaPago: fechaCorta(json['fechaPago']),
      montoFacturado: parseNum(json['montoFacturado']),
      itbis: parseNum(json['itbis']),
      propinaLegal: parseNum(json['propinaLegal']),
      otrosImpuestos: parseNum(json['otrosImpuestos']),
      impuestoSelectivo: parseNum(json['impuestoSelectivo']),
      categoria606: json['categoria606'] as String?,
      tipoComprobante: json['tipoComprobante'] as String?,
      tipoBienServicio: json['tipoBienServicio'] as String?,
      formaPago: json['formaPago'] as String?,
      ncfModificado: json['ncfModificado'] as String?,
      periodoFiscal: json['periodoFiscal'] as String?,
      itbisRetenido: parseNum(json['itbisRetenido']),
      itbisProporcionalidad: parseNum(json['itbisProporcionalidad']),
      itbisCosto: parseNum(json['itbisCosto']),
      itbisPercibido: parseNum(json['itbisPercibido']),
      tipoRetencionIsr: json['tipoRetencionIsr'] as String?,
      montoRetencionRenta: parseNum(json['montoRetencionRenta']),
      isrPercibido: parseNum(json['isrPercibido']),
      imageUrl: json['imageUrl'] as String?,
      imageUrls: (json['imageUrls'] as List?)?.cast<String>() ?? const [],
      camposBajaConfianza:
          (evaluation?['camposBajaConfianza'] as List?)?.cast<String>() ?? const [],
      erroresValidacion: errores,
      alertasDgii: (validacion?['alertas'] as List?)?.cast<String>() ?? const [],
      validacionDgiiOk: validacion?['ok'] as bool? ?? false,
      subidoPor: subido?['nombre'] as String? ?? subido?['email'] as String?,
    );
  }

  final String id;
  final String estado;
  final DateTime createdAt;
  /// Último avance del pipeline (null en respuestas antiguas sin el campo).
  final DateTime? updatedAt;

  /// La factura lleva demasiado tiempo sin avanzar del OCR: el usuario debería
  /// poder reintentar en vez de mirar un spinner eterno.
  bool get pareceAtascada =>
      (estado == 'subida' || estado == 'procesando') &&
      DateTime.now().difference(updatedAt ?? createdAt) > const Duration(minutes: 2);
  final String? clientProfileId;
  final String? clientRazonSocial;
  /// Nombre (o correo) de quien subió la factura. Solo lectura.
  final String? subidoPor;
  final String? ncf;
  final String? rncProveedor;
  final String? tipoIdProveedor;
  final String? razonSocialProveedor;
  final String? fecha;
  final String? fechaPago;
  final double? montoFacturado;
  final double? itbis;
  final double? propinaLegal;
  final double? otrosImpuestos;
  final double? impuestoSelectivo;
  final String? categoria606;
  final String? tipoComprobante;
  final String? tipoBienServicio;
  final String? formaPago;
  final String? ncfModificado;
  final String? periodoFiscal;
  // Retenciones e impuestos (col. 12–23)
  final double? itbisRetenido;
  final double? itbisProporcionalidad;
  final double? itbisCosto;
  final double? itbisPercibido;
  final String? tipoRetencionIsr;
  final double? montoRetencionRenta;
  final double? isrPercibido;
  final String? imageUrl;
  final List<String> imageUrls;
  final List<String> camposBajaConfianza;
  final List<String> erroresValidacion;

  /// Alertas de cotejo fiscal (NCF/RNC/padrón DGII). Vacío = sin problemas.
  final List<String> alertasDgii;
  /// La validación DGII pasó sin alertas.
  final bool validacionDgiiOk;
}

/// Orden estándar de la app: la última cargada arriba (por fecha de creación).
/// Desempate por `id` para que el orden sea estable entre recargas.
extension InvoiceOrdering on List<Invoice> {
  List<Invoice> newestFirst() {
    final copy = [...this];
    copy.sort((a, b) {
      final byDate = b.createdAt.compareTo(a.createdAt);
      return byDate != 0 ? byDate : b.id.compareTo(a.id);
    });
    return copy;
  }
}

const estadoLabels = <String, String>{
  'subida': 'Subida',
  'procesando': 'Procesando',
  'extraida': 'Extraída',
  'en_revision': 'En revisión',
  'validada': 'Validada',
  'incluida_en_606': 'En 606',
  'reportada': 'Reportada',
  'rechazada': 'Rechazada',
  'duplicada': 'Duplicada',
};

/// Las 11 categorías de gasto del Formato 606 (referencia local para la UI).
const categorias606 = <String, String>{
  '01': 'Gastos de personal',
  '02': 'Trabajos, suministros y servicios',
  '03': 'Arrendamientos',
  '04': 'Gastos de activos fijos',
  '05': 'Gastos de representación',
  '06': 'Otras deducciones admitidas',
  '07': 'Gastos financieros',
  '08': 'Gastos extraordinarios',
  '09': 'Costo de venta',
  '10': 'Adquisiciones de activos',
  '11': 'Gastos de seguros',
};
