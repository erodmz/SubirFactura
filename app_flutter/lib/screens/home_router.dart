import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import 'client_home_screen.dart';
import 'client_invoices_screen.dart';
import 'home_screen.dart';
import 'login_screen.dart';
import 'org_selector_screen.dart';
import 'workspace_selector_screen.dart';

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
    try {
      final data = await ApiClient.instance.get('/api/me') as Map<String, dynamic>;
      await ApiClient.instance.cacheMe(data); // respaldo para abrir sin conexión
      return Me.fromJson(data);
    } catch (e) {
      // Sin conexión (o servidor caído): si ya cargamos la cuenta antes en este
      // dispositivo, seguimos con lo cacheado para poder capturar offline; la
      // cola de subida se encarga de enviar al reconectar.
      final cached = await ApiClient.instance.cachedMe();
      if (cached != null) return Me.fromJson(cached);
      rethrow;
    }
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
          title: const Text('SubirFactura'),
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

        // Un mismo usuario puede tener DOS mundos: despacho(s) contable(s) y
        // negocio(s) propios donde sube sus facturas (el dueño que además lleva
        // sus empresas). Antes, si eras contador, la app te ocultaba tus
        // negocios; ahora se contemplan ambos.
        final despachos = me.contadorMemberships;
        final negocios = me.clientProfiles;

        // Caso mixto: ofrecer ambos mundos en un selector unificado.
        if (despachos.isNotEmpty && negocios.isNotEmpty) {
          return WorkspaceSelectorScreen(me: me, despachos: despachos, negocios: negocios);
        }

        // Solo despacho(s): 1 → directo, varios → selector de despachos.
        if (despachos.isNotEmpty) {
          if (despachos.length == 1) {
            return HomeScreen(membership: despachos.first, me: me, canSwitchOrg: false);
          }
          return OrgSelectorScreen(me: me, memberships: despachos);
        }

        // Solo negocio(s).
        if (negocios.isEmpty) {
          return _message(
            'Aún no tienes un negocio asignado.\nPide a tu contador que te habilite para subir facturas.',
          );
        }
        if (negocios.length == 1) {
          return ClientHomeScreen(client: negocios.first, me: me, canSwitch: false);
        }
        // Varios negocios: una sola pantalla con filtro de empresas + búsqueda.
        return ClientInvoicesScreen(me: me);
      },
    );
  }
}
