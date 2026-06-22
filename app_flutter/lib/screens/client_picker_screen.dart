import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import 'client_home_screen.dart';
import 'login_screen.dart';

/// Selector de negocio para un cliente que sube facturas a varios.
class ClientPickerScreen extends StatelessWidget {
  const ClientPickerScreen({super.key, required this.me});

  final Me me;

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
        title: const Text('Mis negocios'),
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
          const Padding(
            padding: EdgeInsets.only(bottom: 8, left: 4),
            child: Text('Elige el negocio para subir o ver facturas.',
                style: TextStyle(color: Colors.grey)),
          ),
          for (final c in me.clientProfiles)
            Card(
              child: ListTile(
                leading: CircleAvatar(
                  child: Text(
                    (c.razonSocial.isNotEmpty ? c.razonSocial[0] : '?').toUpperCase(),
                  ),
                ),
                title: Text(c.razonSocial),
                subtitle: Text(c.rncOCedula),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ClientHomeScreen(client: c, me: me, canSwitch: true),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
