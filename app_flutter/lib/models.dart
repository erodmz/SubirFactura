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
  });

  factory Me.fromJson(Map<String, dynamic> json) => Me(
        userId: json['userId'] as String,
        email: json['email'] as String,
        nombre: json['nombre'] as String?,
        isSuperAdmin: json['isSuperAdmin'] as bool? ?? false,
        memberships: (json['memberships'] as List)
            .map((e) => Membership.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final String userId;
  final String email;
  final String? nombre;
  final bool isSuperAdmin;
  final List<Membership> memberships;

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
  });

  factory Membership.fromJson(Map<String, dynamic> json) {
    final org = json['organization'] as Map<String, dynamic>;
    return Membership(
      membershipId: json['membershipId'] as String,
      rol: json['rol'] as String,
      orgId: org['id'] as String,
      orgNombre: org['nombre'] as String,
    );
  }

  final String membershipId;
  final String rol;
  final String orgId;
  final String orgNombre;
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
    this.clientRazonSocial,
    this.ncf,
    this.rncProveedor,
    this.razonSocialProveedor,
    this.fecha,
    this.montoFacturado,
    this.itbis,
    this.propinaLegal,
    this.otrosImpuestos,
    this.categoria606,
    this.tipoComprobante,
    this.periodoFiscal,
    this.imageUrl,
    this.imageUrls = const [],
    this.camposBajaConfianza = const [],
    this.erroresValidacion = const [],
  });

  factory Invoice.fromJson(Map<String, dynamic> json) {
    final client = json['clientProfile'] as Map<String, dynamic>?;
    final confianza = json['confianzaPorCampo'] as Map<String, dynamic>?;
    final evaluation = confianza?['evaluation'] as Map<String, dynamic>?;
    final errores = <String>[
      ...?(evaluation?['erroresValidacion'] as List?)?.cast<String>(),
      if (confianza?['error'] is String) confianza!['error'] as String,
    ];
    return Invoice(
      id: json['id'] as String,
      estado: json['estado'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      clientRazonSocial: client?['razonSocial'] as String?,
      ncf: json['ncf'] as String?,
      rncProveedor: json['rncProveedor'] as String?,
      razonSocialProveedor: json['razonSocialProveedor'] as String?,
      fecha: (json['fecha'] as String?)?.substring(0, 10),
      montoFacturado: parseNum(json['montoFacturado']),
      itbis: parseNum(json['itbis']),
      propinaLegal: parseNum(json['propinaLegal']),
      otrosImpuestos: parseNum(json['otrosImpuestos']),
      categoria606: json['categoria606'] as String?,
      tipoComprobante: json['tipoComprobante'] as String?,
      periodoFiscal: json['periodoFiscal'] as String?,
      imageUrl: json['imageUrl'] as String?,
      imageUrls: (json['imageUrls'] as List?)?.cast<String>() ?? const [],
      camposBajaConfianza:
          (evaluation?['camposBajaConfianza'] as List?)?.cast<String>() ?? const [],
      erroresValidacion: errores,
    );
  }

  final String id;
  final String estado;
  final DateTime createdAt;
  final String? clientRazonSocial;
  final String? ncf;
  final String? rncProveedor;
  final String? razonSocialProveedor;
  final String? fecha;
  final double? montoFacturado;
  final double? itbis;
  final double? propinaLegal;
  final double? otrosImpuestos;
  final String? categoria606;
  final String? tipoComprobante;
  final String? periodoFiscal;
  final String? imageUrl;
  final List<String> imageUrls;
  final List<String> camposBajaConfianza;
  final List<String> erroresValidacion;
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
