import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// Tema de FacturaRD alineado con el panel web (estética Monday): azul de marca,
/// superficies blancas en claro y azul-noche en oscuro, tarjetas redondeadas.
const brandBlue = Color(0xFF0073EA);
const brandPurple = Color(0xFFA25DDC);
const brandGreen = Color(0xFF00C875);
const brandOrange = Color(0xFFFDAB3D);
const textInk = Color(0xFF323338);

// Paleta oscura (igual que web :root[data-theme='dark'])
const _darkBg = Color(0xFF181B34);
const _darkCard = Color(0xFF21243F);
const _darkBorder = Color(0xFF34374F);
const _darkText = Color(0xFFE7E8F2);
const _darkBrand = Color(0xFF5B8DEF);

ThemeData buildTheme() => _buildTheme(Brightness.light);
ThemeData buildDarkTheme() => _buildTheme(Brightness.dark);

ThemeData _buildTheme(Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  final brand = isDark ? _darkBrand : brandBlue;
  final surface = isDark ? _darkCard : Colors.white;
  final border = isDark ? _darkBorder : const Color(0xFFE6E9EF);
  final onSurface = isDark ? _darkText : textInk;

  final scheme = ColorScheme.fromSeed(
    seedColor: brandBlue,
    brightness: brightness,
  ).copyWith(primary: brand, surface: surface);

  const radius = 14.0;

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: isDark ? _darkBg : const Color(0xFFF6F7FB),
    fontFamily: 'Inter',
    appBarTheme: AppBarTheme(
      backgroundColor: surface,
      foregroundColor: onSurface,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: onSurface,
        fontSize: 19,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: surface,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
        side: BorderSide(color: border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: brand, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: brand,
      foregroundColor: Colors.white,
    ),
    chipTheme: const ChipThemeData(side: BorderSide.none),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.android: ZoomPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
      },
    ),
  );
}
