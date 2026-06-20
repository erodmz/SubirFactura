import 'package:flutter/material.dart';

import 'api/client.dart';
import 'screens/home_router.dart';
import 'screens/login_screen.dart';
import 'services/upload_queue.dart';
import 'theme.dart';

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
      theme: buildTheme(),
      home: ApiClient.instance.hasSession ? const HomeRouter() : const LoginScreen(),
    );
  }
}
