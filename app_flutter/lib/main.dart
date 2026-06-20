import 'package:flutter/material.dart';

import 'api/client.dart';
import 'screens/home_router.dart';
import 'screens/login_screen.dart';
import 'services/upload_queue.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.instance.loadTokens();
  await UploadQueue.instance.init();
  runApp(const FacturaRdApp());
}

class FacturaRdApp extends StatelessWidget {
  const FacturaRdApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FacturaRD',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1C4ED8)),
        useMaterial3: true,
      ),
      home: ApiClient.instance.hasSession ? const HomeRouter() : const LoginScreen(),
    );
  }
}
