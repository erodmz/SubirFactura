import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import 'client_home_screen.dart';
import 'home_screen.dart';
import 'login_screen.dart';

/// Selector cuando un mismo usuario tiene DOS mundos a la vez: despacho(s)
/// contable(s) y negocio(s) propios donde sube sus facturas. El caso real:
/// el dueño que administra su despacho y además lleva las facturas de sus
/// empresas. Antes la app, al ver que eras contador, ocultaba tus negocios.
class WorkspaceSelectorScreen extends StatelessWidget {
  const WorkspaceSelectorScreen({
    super.key,
    required this.me,
    required this.despachos,
    required this.negocios,
  });

  final Me me;
  final List<Membership> despachos;
  final List<ClientAccess> negocios;

  Future<void> _logout(BuildContext context) async {
    await ApiClient.instance.clearTokens();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Widget _sectionTitle(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
        child: Text(
          text,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
              ),
        ),
      );

  Widget _logoOrInitial(BuildContext context, String? logoUrl, String nombre) {
    if (logoUrl != null) {
      return Container(
        width: 44,
        height: 44,
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Image.network('${ApiClient.baseUrl}$logoUrl', fit: BoxFit.contain),
      );
    }
    return CircleAvatar(
      child: Text((nombre.isNotEmpty ? nombre[0] : '?').toUpperCase()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Elige dónde entrar'),
        actions: [
          IconButton(
            onPressed: () => _logout(context),
            icon: const Icon(Icons.logout),
            tooltip: 'Salir',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              'Hola, ${me.displayName.split(' ').first} 👋',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),

          if (despachos.isNotEmpty) _sectionTitle(context, 'MIS DESPACHOS'),
          for (final m in despachos)
            Card(
              child: ListTile(
                leading: _logoOrInitial(context, m.orgLogoUrl, m.orgNombre),
                title: Text(m.orgNombre),
                subtitle: Text(m.rol.replaceAll('_', ' ')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => HomeScreen(membership: m, me: me, canSwitchOrg: true),
                  ),
                ),
              ),
            ),

          if (negocios.isNotEmpty) _sectionTitle(context, 'MIS NEGOCIOS'),
          for (final n in negocios)
            Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.storefront_outlined, size: 20)),
                title: Text(n.razonSocial),
                subtitle: Text('${n.organizationNombre} · subir facturas'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ClientHomeScreen(client: n, me: me, canSwitch: true),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
