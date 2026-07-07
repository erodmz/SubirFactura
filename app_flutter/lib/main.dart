import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import 'api/client.dart';
import 'screens/home_router.dart';
import 'screens/login_screen.dart';
import 'screens/shared_upload_screen.dart';
import 'services/connectivity_service.dart';
import 'services/theme_controller.dart';
import 'services/upload_queue.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ApiClient.assertConfigured(); // release sin API_URL debe fallar aquí, no en silencio
  await ApiClient.instance.loadTokens();
  await ThemeController.instance.load();
  await ConnectivityService.instance.init();
  await UploadQueue.instance.init();
  runApp(const FacturaRdApp());
}

class FacturaRdApp extends StatefulWidget {
  const FacturaRdApp({super.key});

  @override
  State<FacturaRdApp> createState() => _FacturaRdAppState();
}

class _FacturaRdAppState extends State<FacturaRdApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  StreamSubscription<List<SharedMediaFile>>? _shareSub;

  @override
  void initState() {
    super.initState();
    // Fotos compartidas desde otra app (Share Extension iOS / intent Android).
    _shareSub = ReceiveSharingIntent.instance.getMediaStream().listen(_onShared);
    ReceiveSharingIntent.instance.getInitialMedia().then((files) {
      _onShared(files);
      ReceiveSharingIntent.instance.reset();
    });
  }

  void _onShared(List<SharedMediaFile> files) {
    final photos = files
        .where((f) => f.type == SharedMediaType.image)
        .map((f) => File(f.path))
        .toList();
    if (photos.isEmpty) return;
    // Espera a que el árbol esté listo, luego abre la pantalla de subida.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _navigatorKey.currentState?.push(
        MaterialPageRoute(builder: (_) => SharedUploadScreen(photos: photos)),
      );
    });
  }

  @override
  void dispose() {
    _shareSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeController.instance.mode,
      builder: (context, mode, _) {
        return MaterialApp(
          navigatorKey: _navigatorKey,
          title: 'SubirFactura',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(),
          darkTheme: buildDarkTheme(),
          themeMode: mode,
          home: ApiClient.instance.hasSession ? const HomeRouter() : const LoginScreen(),
        );
      },
    );
  }
}
