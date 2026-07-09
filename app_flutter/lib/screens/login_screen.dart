import 'package:flutter/material.dart';

import '../api/client.dart';
import '../widgets/error_banner.dart';
import '../widgets/logo.dart';
import 'forgot_password_screen.dart';
import 'home_router.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;
  IconData _errorIcon = Icons.error_outline;
  bool _busy = false;
  bool _obscure = true;

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await ApiClient.instance.post('/api/auth/login', {
        'email': _email.text.trim(),
        'password': _password.text,
      }) as Map<String, dynamic>;
      final tokens = data['tokens'] as Map<String, dynamic>;
      await ApiClient.instance
          .saveTokens(tokens['accessToken'] as String, tokens['refreshToken'] as String);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeRouter()),
      );
    } on ApiException catch (e) {
      // Error del servidor (credenciales, límite de intentos, etc.).
      setState(() {
        _error = e.message;
        _errorIcon = Icons.lock_outline;
      });
    } catch (_) {
      // Sin respuesta del servidor: problema de conexión.
      setState(() {
        _error = 'No pudimos conectar con el servidor.\nRevisa tu conexión a internet e inténtalo de nuevo.';
        _errorIcon = Icons.wifi_off_rounded;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: const Duration(milliseconds: 500),
                curve: Curves.easeOutBack,
                builder: (context, t, child) => Opacity(
                  opacity: t.clamp(0, 1),
                  child: Transform.scale(scale: 0.85 + 0.15 * t, child: child),
                ),
                child: const Center(child: Logo(size: 40)),
              ),
              const SizedBox(height: 14),
              const Text(
                'Fotografía tus facturas y tu contador se encarga del resto.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: 'Correo electrónico',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _password,
                obscureText: _obscure,
                decoration: InputDecoration(
                  labelText: 'Contraseña',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    tooltip: _obscure ? 'Mostrar contraseña' : 'Ocultar contraseña',
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                onSubmitted: (_) => _login(),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _busy ? null : _login,
                child: Text(_busy ? 'Entrando…' : 'Entrar'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                ErrorBanner(message: _error!, icon: _errorIcon),
              ],
              const SizedBox(height: 8),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ForgotPasswordScreen(email: _email.text.trim()),
                          ),
                        ),
                child: const Text('¿Olvidaste tu contraseña?'),
              ),
              const SizedBox(height: 8),
              const Text(
                '¿No tienes cuenta? Pide a tu contador un enlace de invitación.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
