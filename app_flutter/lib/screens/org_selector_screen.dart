import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import 'home_screen.dart';
import 'login_screen.dart';

/// Selector de empresa: un usuario puede pertenecer a varias con roles
/// distintos (ESPECIFICACION.md §4).
class OrgSelectorScreen extends StatefulWidget {
  const OrgSelectorScreen({super.key});

  @override
  State<OrgSelectorScreen> createState() => _OrgSelectorScreenState();
}

class _OrgSelectorScreenState extends State<OrgSelectorScreen> {
  late Future<List<Membership>> _memberships;

  @override
  void initState() {
    super.initState();
    _memberships = _load();
  }

  Future<List<Membership>> _load() async {
    final data = await ApiClient.instance.get('/api/me') as Map<String, dynamic>;
    return (data['memberships'] as List)
        .map((e) => Membership.fromJson(e as Map<String, dynamic>))
        .toList();
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
      body: FutureBuilder<List<Membership>>(
        future: _memberships,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final memberships = snapshot.data!;
          if (memberships.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Aún no perteneces a ninguna empresa.\nPide a tu contador una invitación.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: memberships.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final m = memberships[index];
              return Card(
                child: ListTile(
                  title: Text(m.orgNombre),
                  subtitle: Text(m.rol.replaceAll('_', ' ')),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => HomeScreen(membership: m)),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
