import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

/// Cliente HTTP: adjunta el access token y ante un 401 renueva con el
/// refresh token rotado (una sola vez) antes de invalidar la sesión.
class ApiClient {
  ApiClient._();

  static final ApiClient instance = ApiClient._();

  /// Configurable en build: flutter run --dart-define=API_URL=http://10.0.2.2:3000
  static const String baseUrl =
      String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000');

  static const _tokensKey = 'facturard_tokens';

  String? _accessToken;
  String? _refreshToken;

  bool get hasSession => _accessToken != null;

  Future<void> loadTokens() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_tokensKey);
    if (raw != null) {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      _accessToken = data['accessToken'] as String?;
      _refreshToken = data['refreshToken'] as String?;
    }
  }

  Future<void> saveTokens(String accessToken, String refreshToken) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _tokensKey,
      jsonEncode({'accessToken': accessToken, 'refreshToken': refreshToken}),
    );
  }

  Future<void> clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokensKey);
  }

  Future<dynamic> get(String path) => _request('GET', path);

  Future<dynamic> post(String path, [Object? body]) => _request('POST', path, body);

  Future<dynamic> patch(String path, [Object? body]) => _request('PATCH', path, body);

  Future<dynamic> _request(String method, String path, [Object? body]) async {
    var response = await _send(method, path, body);
    if (response.statusCode == 401 && await _tryRefresh()) {
      response = await _send(method, path, body);
    }
    return _handle(response);
  }

  Future<http.Response> _send(String method, String path, Object? body) {
    final uri = Uri.parse('$baseUrl$path');
    final headers = {
      'Content-Type': 'application/json',
      if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
    };
    final encoded = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'POST':
        return http.post(uri, headers: headers, body: encoded);
      case 'PATCH':
        return http.patch(uri, headers: headers, body: encoded);
      default:
        return http.get(uri, headers: headers);
    }
  }

  Future<bool> _tryRefresh() async {
    final refreshToken = _refreshToken;
    if (refreshToken == null) return false;
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refreshToken': refreshToken}),
    );
    if (response.statusCode != 200) {
      await clearTokens();
      return false;
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    await saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
    return true;
  }

  dynamic _handle(http.Response response) {
    if (response.statusCode == 204) return null;
    final body = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) return body;

    var message = 'Error ${response.statusCode}';
    if (body is Map<String, dynamic>) {
      final raw = body['message'];
      if (raw is List) {
        message = raw.join('. ');
      } else if (raw is String) {
        message = raw;
      }
    }
    throw ApiException(response.statusCode, message);
  }

  /// Subida multipart de una factura con una o varias páginas (fotos).
  Future<Map<String, dynamic>> uploadInvoice({
    required String orgId,
    required String clientProfileId,
    required List<File> files,
  }) async {
    Future<http.StreamedResponse> send() {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/api/organizations/$orgId/invoices'),
      )
        ..headers['Authorization'] = 'Bearer $_accessToken'
        ..fields['clientProfileId'] = clientProfileId;
      for (final file in files) {
        final isPng = file.path.toLowerCase().endsWith('.png');
        request.files.add(
          http.MultipartFile(
            'files',
            file.openRead(),
            file.lengthSync(),
            filename: file.uri.pathSegments.last,
            contentType: MediaType('image', isPng ? 'png' : 'jpeg'),
          ),
        );
      }
      return request.send();
    }

    var streamed = await send();
    if (streamed.statusCode == 401 && await _tryRefresh()) {
      streamed = await send();
    }
    final response = await http.Response.fromStream(streamed);
    return _handle(response) as Map<String, dynamic>;
  }
}
