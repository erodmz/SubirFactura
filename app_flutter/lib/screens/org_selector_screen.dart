import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import 'home_screen.dart';
import 'login_screen.dart';

/// Selector de empresa (cuando el usuario pertenece a varias, §4).
class OrgSelectorScreen extends StatefulWidget {
  const OrgSelectorScreen({super.key, this.me});

  /// Si ya se cargó el perfil (desde HomeRouter), se reutiliza sin re-pedirlo.
  final Me? me;

  @override
  State<OrgSelectorScreen> createState() => _OrgSelectorScreenState();
}

class _OrgSelectorScreenState extends State<OrgSelectorScreen> {
  late Future<Me> _me;

  @override
  void initState() {
    super.initState();
    _me = widget.me != null ? Future.value(widget.me) : _load();
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis empresas'),
        actions: [
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout), tooltip: 'Salir'),
        ],
      ),
      body: FutureBuilder<Me>(
        future: _me,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final me = snapshot.data!;
          final memberships = me.memberships;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 8, left: 4),
                child: Text(
                  'Hola, ${me.displayName.split(' ').first} 👋',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(bottom: 12, left: 4),
                child: Text('Elige una empresa para continuar.',
                    style: TextStyle(color: Colors.grey)),
              ),
              for (final m in memberships)
                Card(
                  child: ListTile(
                    leading: CircleAvatar(
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
          );
        },
      ),
    );
  }
}
