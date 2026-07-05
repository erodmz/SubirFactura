import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/client.dart';
import 'connectivity_service.dart';

class PendingUpload {
  PendingUpload({
    required this.id,
    required this.orgId,
    required this.clientProfileId,
    required this.filePaths,
    this.attempts = 0,
    this.lastError,
  });

  factory PendingUpload.fromJson(Map<String, dynamic> json) => PendingUpload(
        id: json['id'] as String,
        orgId: json['orgId'] as String,
        clientProfileId: json['clientProfileId'] as String?,
        // Compat: versiones previas guardaban una sola ruta en 'filePath'
        filePaths: (json['filePaths'] as List?)?.cast<String>() ??
            [if (json['filePath'] != null) json['filePath'] as String],
        attempts: json['attempts'] as int? ?? 0,
        lastError: json['lastError'] as String?,
      );

  final String id;
  final String orgId;
  final String? clientProfileId;
  final List<String> filePaths;
  int attempts;
  String? lastError;

  Map<String, dynamic> toJson() => {
        'id': id,
        'orgId': orgId,
        'clientProfileId': clientProfileId,
        'filePaths': filePaths,
        'attempts': attempts,
        'lastError': lastError,
      };
}

/// Cola de subida offline-first (ESPECIFICACION.md Fase 2): la foto se guarda
/// local al instante y se sube cuando hay señal, con reintentos automáticos.
/// La factura nunca se pierde aunque la app se cierre.
class UploadQueue extends ChangeNotifier {
  UploadQueue._();

  static final UploadQueue instance = UploadQueue._();

  static const _storageKey = 'facturard_upload_queue';

  final List<PendingUpload> _items = [];
  bool _processing = false;
  String? lastRejection;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  Timer? _retryTimer;

  List<PendingUpload> get items => List.unmodifiable(_items);

  int get pendingCount => _items.length;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw != null) {
      _items
        ..clear()
        ..addAll((jsonDecode(raw) as List)
            .map((e) => PendingUpload.fromJson(e as Map<String, dynamic>)));
    }
    // Reintentos al recuperar señal + barrido periódico de respaldo
    _connectivitySub = Connectivity().onConnectivityChanged.listen((_) => processAll());
    _retryTimer = Timer.periodic(const Duration(minutes: 2), (_) => processAll());
    unawaited(processAll());
  }

  Future<void> enqueue({
    required String orgId,
    required String? clientProfileId,
    required List<File> images,
  }) async {
    final dir = await getApplicationDocumentsDirectory();
    final queueDir = Directory('${dir.path}/upload_queue');
    await queueDir.create(recursive: true);

    final id = DateTime.now().millisecondsSinceEpoch.toString();
    final paths = <String>[];
    for (var i = 0; i < images.length; i++) {
      final ext = images[i].path.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      final stored = await images[i].copy('${queueDir.path}/${id}_$i.$ext');
      paths.add(stored.path);
    }

    _items.add(PendingUpload(
      id: id,
      orgId: orgId,
      clientProfileId: clientProfileId,
      filePaths: paths,
    ));
    await _persist();
    notifyListeners();
    unawaited(processAll());
  }

  Future<void> processAll() async {
    if (_processing || _items.isEmpty || !ApiClient.instance.hasSession) return;
    // Sin conexión: no intentamos red (ahorra batería). El listener de señal
    // dispara este barrido apenas vuelve la conexión.
    if (!ConnectivityService.instance.online.value) return;
    _processing = true;
    try {
      for (final item in List.of(_items)) {
        try {
          await ApiClient.instance.uploadInvoice(
            orgId: item.orgId,
            clientProfileId: item.clientProfileId,
            files: item.filePaths.map(File.new).toList(),
          );
          await _remove(item);
        } on ApiException catch (e) {
          if (e.statusCode == 401) break; // sesión inválida: esperar re-login
          if (e.statusCode >= 400 && e.statusCode < 500) {
            // Rechazo definitivo (duplicada, límite del plan…): sacar de la cola
            lastRejection = e.message;
            await _remove(item);
          } else {
            item
              ..attempts += 1
              ..lastError = e.message;
          }
        } catch (_) {
          // Sin conexión: detener el barrido, el listener de señal lo reintenta
          item
            ..attempts += 1
            ..lastError = 'Sin conexión';
          break;
        }
      }
    } finally {
      _processing = false;
      await _persist();
      notifyListeners();
    }
  }

  void clearRejection() {
    lastRejection = null;
    notifyListeners();
  }

  Future<void> _remove(PendingUpload item) async {
    _items.remove(item);
    for (final path in item.filePaths) {
      try {
        await File(path).delete();
      } catch (_) {/* ya no existe */}
    }
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, jsonEncode(_items.map((e) => e.toJson()).toList()));
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    _retryTimer?.cancel();
    super.dispose();
  }
}
