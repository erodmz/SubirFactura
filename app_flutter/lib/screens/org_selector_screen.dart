import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import 'home_screen.dart';
import 'login_screen.dart';

/// Selector de despacho contable (cuando un contador administra varios, §4).
class OrgSelectorScreen extends StatelessWidget {
  const OrgSelectorScreen({super.key, required this.me, required this.memberships});

  final Me me;
  final List<Membership> memberships;

  Future<void> _logout(BuildContext context) async {
    await ApiClient.instance.clearTokens();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis despachos'),
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
            padding: const EdgeInsets.only(bottom: 12, left: 4),
            child: Text(
              'Hola, ${me.displayName.split(' ').first} 👋',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          for (final m in memberships)
            Card(
              child: ListTile(
                leading: m.orgLogoUrl != null
                    // Logo completo (sin recortar) sobre fondo blanco; funciona con
                    // logos anchos o transparentes.
                    ? Container(
                        width: 44,
                        height: 44,
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Theme.of(context).dividerColor),
                        ),
                        child: Image.network(m.orgLogoUrl!, fit: BoxFit.contain),
                      )
                    : CircleAvatar(
                        child: Text(
                          (m.orgNombre.isNotEmpty ? m.orgNombre[0] : '?').toUpperCase(),
                        ),
                      ),
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
        ],
      ),
    );
  }
}
