import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../services/theme_controller.dart';

/// Mi cuenta: tema (claro/oscuro/sistema), cambio de contraseña y, a futuro,
/// otras preferencias del usuario.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.me});

  final Me me;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    setState(() => _error = null);
    if (_next.text.length < 8) {
      setState(() => _error = 'La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (_next.text != _confirm.text) {
      setState(() => _error = 'La confirmación no coincide');
      return;
    }
    setState(() => _saving = true);
    try {
      final res = await ApiClient.instance.post('/api/auth/change-password', {
        'currentPassword': _current.text,
        'newPassword': _next.text,
      }) as Map<String, dynamic>;
      await ApiClient.instance.saveTokens(
        res['accessToken'] as String,
        res['refreshToken'] as String,
      );
      if (!mounted) return;
      _current.clear();
      _next.clear();
      _confirm.clear();
      FocusScope.of(context).unfocus();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contraseña actualizada')),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo cambiar la contraseña');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mi cuenta')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Datos del usuario ──────────────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                    child: Text(
                      widget.me.initials,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.me.displayName,
                            style: const TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 16)),
                        Text(widget.me.email,
                            style: TextStyle(color: Theme.of(context).hintColor)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ── Apariencia ─────────────────────────────────────────────────
          Text('Apariencia', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: ValueListenableBuilder<ThemeMode>(
                valueListenable: ThemeController.instance.mode,
                builder: (context, mode, _) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Tema'),
                      const SizedBox(height: 10),
                      SegmentedButton<ThemeMode>(
                        segments: const [
                          ButtonSegment(
                            value: ThemeMode.light,
                            label: Text('Claro'),
                            icon: Icon(Icons.light_mode),
                          ),
                          ButtonSegment(
                            value: ThemeMode.dark,
                            label: Text('Oscuro'),
                            icon: Icon(Icons.dark_mode),
                          ),
                          ButtonSegment(
                            value: ThemeMode.system,
                            label: Text('Sistema'),
                            icon: Icon(Icons.brightness_auto),
                          ),
                        ],
                        selected: {mode},
                        onSelectionChanged: (s) =>
                            ThemeController.instance.set(s.first),
                      ),
                      const SizedBox(height: 8),
                      Text('«Sistema» usa el tema claro u oscuro de tu teléfono.',
                          style: TextStyle(
                              fontSize: 12, color: Theme.of(context).hintColor)),
                    ],
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ── Cambiar contraseña ─────────────────────────────────────────
          Text('Seguridad', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Cambiar contraseña',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  if (_error != null) ...[
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                    const SizedBox(height: 8),
                  ],
                  TextField(
                    controller: _current,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Contraseña actual'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _next,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Nueva contraseña'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _confirm,
                    obscureText: true,
                    decoration:
                        const InputDecoration(labelText: 'Confirmar nueva contraseña'),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _saving ? null : _changePassword,
                      child: Text(_saving ? 'Guardando…' : 'Cambiar contraseña'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
