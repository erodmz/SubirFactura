import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// Estado de conexión de red (para el indicador visible en la barra superior).
/// connectivity_plus reporta si hay interfaz de red; es lo que usa la industria
/// para un indicador ligero (no hace ping real a un servidor).
class ConnectivityService {
  ConnectivityService._();
  static final ConnectivityService instance = ConnectivityService._();

  final ValueNotifier<bool> online = ValueNotifier(true);
  StreamSubscription<List<ConnectivityResult>>? _sub;

  Future<void> init() async {
    await _sub?.cancel();
    try {
      online.value = _isOnline(await Connectivity().checkConnectivity());
    } catch (_) {
      online.value = true; // ante la duda, asumimos conectado
    }
    _sub = Connectivity().onConnectivityChanged.listen((r) => online.value = _isOnline(r));
  }

  bool _isOnline(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);
}
