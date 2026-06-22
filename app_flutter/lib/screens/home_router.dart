import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import 'client_home_screen.dart';
import 'client_picker_screen.dart';
import 'home_screen.dart';
import 'login_screen.dart';
import 'org_selector_screen.dart';

/// Decide a dónde entrar según el rol y los accesos:
/// - Contador/admin → despacho(s) contable(s): 1 → directo, varios → selector.
/// - Cliente → sus negocios: 0 → aviso, 1 → directo a sus facturas, varios → selector.
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

  Widget _message(String text) => Scaffold(
        appBar: AppBar(
          title: const Text('FacturaRD'),
          actions: [
            IconButton(onPressed: _logout, icon: const Icon(Icons.logout), tooltip: 'Salir'),
          ],
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(text, textAlign: TextAlign.center),
          ),
        ),
      );

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

        // Contador/admin: trabaja a nivel de despacho.
        final despachos = me.contadorMemberships;
        if (despachos.isNotEmpty) {
          if (despachos.length == 1) {
            return HomeScreen(
              membership: despachos.first,
              me: me,
              canSwitchOrg: false,
            );
          }
          return OrgSelectorScreen(me: me, memberships: despachos);
        }

        // Cliente: ve sus negocios, no el despacho.
        final negocios = me.clientProfiles;
        if (negocios.isEmpty) {
          return _message(
            'Aún no tienes un negocio asignado.\nPide a tu contador que te habilite para subir facturas.',
          );
        }
        if (negocios.length == 1) {
          return ClientHomeScreen(client: negocios.first, me: me, canSwitch: false);
        }
        return ClientPickerScreen(me: me);
      },
    );
  }
}
