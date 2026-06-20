import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import 'home_screen.dart';
import 'login_screen.dart';
import 'org_selector_screen.dart';

/// Decide a dónde entrar tras iniciar sesión:
/// - 0 empresas  → mensaje (pide invitación)
/// - 1 empresa   → directo a sus facturas (sin selector)
/// - 2+ empresas → selector de empresa
class HomeRouter extends StatefulWidget {
  const HomeRouter({super.key});

  @override
  State<HomeRouter> createState() => _HomeRouterState();
}

class _HomeRouterState extends State<HomeRouter> {
  late Future<Me> _me;

  @override
  void initState() {
    super.initState();
    _me = _load();
  }

  Future<Me> _load() async {
    final data = await ApiClient.instance.get('/api/me') as Map<String, dynamic>;
    return Me.fromJson(data);
  }

  Future<void> _logout() async {
    await ApiClient.instance.clearTokens();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Me>(
      future: _me,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (snapshot.hasError) {
          return Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.cloud_off, size: 40, color: Colors.grey),
                    const SizedBox(height: 12),
                    const Text('No se pudo cargar tu cuenta.', textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => setState(() => _me = _load()),
                      child: const Text('Reintentar'),
                    ),
                    TextButton(onPressed: _logout, child: const Text('Cerrar sesión')),
                  ],
                ),
              ),
            ),
          );
        }

        final me = snapshot.data!;
        if (me.memberships.isEmpty) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('FacturaRD'),
              actions: [
                IconButton(onPressed: _logout, icon: const Icon(Icons.logout), tooltip: 'Salir'),
              ],
            ),
            body: const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Aún no perteneces a ninguna empresa.\nPide a tu contador un enlace de invitación.',
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          );
        }

        if (me.memberships.length == 1) {
          return HomeScreen(membership: me.memberships.first, me: me, canSwitchOrg: false);
        }

        return OrgSelectorScreen(me: me);
      },
    );
  }
}
