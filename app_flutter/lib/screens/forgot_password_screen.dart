import 'package:flutter/material.dart';

import '../api/client.dart';

/// Solicita el restablecimiento de contraseña. El cambio en sí se completa desde
/// el enlace que llega al correo (página web de reset), así que aquí solo pedimos
/// el correo y confirmamos el envío.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, this.email = ''});

  final String email;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final TextEditingController _email = TextEditingController(text: widget.email);
  bool _busy = false;
  bool _sent = false;
  String? _error;

  Future<void> _submit() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Escribe tu correo');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ApiClient.instance.post('/api/auth/forgot-password', {'email': email});
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No se pudo conectar al servidor');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Restablecer contraseña')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: _sent
                ? [
                    const Icon(Icons.mark_email_read_outlined, size: 56, color: Colors.green),
                    const SizedBox(height: 16),
                    Text(
                      'Si ${_email.text.trim()} tiene una cuenta, te enviamos un enlace '
                      'para restablecer tu contraseña. Revisa tu correo (y el spam) y '
                      'ábrelo para crear una nueva.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Volver a iniciar sesión'),
                    ),
                  ]
                : [
                    const Text(
                      'Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.',
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 20),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(_error!, style: const TextStyle(color: Colors.red)),
                      ),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Correo electrónico',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: Text(_busy ? 'Enviando…' : 'Enviar enlace'),
                    ),
                  ],
          ),
        ),
      ),
    );
  }
}
