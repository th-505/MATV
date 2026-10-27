import 'app_target.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

class NajdAppearance extends ChangeNotifier {
  static final instance = NajdAppearance();
  ThemeMode mode = ThemeMode.dark;
  String? fontFamily;
  void setFontFamily(String? value) {
    fontFamily = value;
    notifyListeners();
  }

  Future<void> load() async {
    final saved = (await SharedPreferences.getInstance()).getString(
      'najd.theme.v1',
    );
    mode = ThemeMode.values.firstWhere(
      (m) => m.name == saved,
      orElse: () => ThemeMode.dark,
    );
    notifyListeners();
  }

  Future<void> setMode(ThemeMode value) async {
    mode = value;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setString(
      'najd.theme.v1',
      value.name,
    );
  }
}

Future<bool> loadPrivateNajdFonts() async {
  final paths = [
    for (final weight in ['Regular', 'Medium', 'Bold'])
      'assets/najd/fonts/thmanyahsans-$weight.otf',
  ];
  try {
    final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
    final bundled = manifest.listAssets().toSet();
    if (!paths.every(bundled.contains)) return false;
    final loader = FontLoader('ThmanyahSans');
    for (final weight in ['Regular', 'Medium', 'Bold']) {
      loader.addFont(
        rootBundle.load('assets/najd/fonts/thmanyahsans-$weight.otf'),
      );
    }
    await loader.load();
    return true;
  } catch (_) {
    return false;
  } // No raw fonts are present in public source builds.
}

class NajdThemes {
  static const lavender = Color(0xFF8280FF);
  static ThemeData forBrightness(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final background = dark ? const Color(0xFF08080E) : const Color(0xFFFCFCFF);
    final surface = dark ? const Color(0xFF14131F) : Colors.white;
    final text = dark ? const Color(0xFFF8F7FF) : const Color(0xFF211E32);
    final secondary = dark ? const Color(0xFFBCB8CF) : const Color(0xFF5D5771);
    final primary = dark ? const Color(0xFF9B99FF) : const Color(0xFF4D4C9A);
    final onPrimary = dark ? const Color(0xFF19172C) : Colors.white;
    final scheme =
        ColorScheme.fromSeed(
          seedColor: lavender,
          brightness: brightness,
        ).copyWith(
          primary: primary,
          onPrimary: onPrimary,
          secondary: primary,
          surface: surface,
          onSurface: text,
          onSurfaceVariant: secondary,
          outline: dark ? const Color(0xFF3D3658) : const Color(0xFFDAD7EC),
        );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      fontFamily: NajdAppearance.instance.fontFamily ?? 'ThmanyahSans',
      fontFamilyFallback: const ['NajdArabicFallback'],
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: text,
        centerTitle: true,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: scheme.outline),
        ),
      ),
      textTheme: ThemeData(brightness: brightness).textTheme.apply(
        fontFamily: NajdAppearance.instance.fontFamily ?? 'ThmanyahSans',
        fontFamilyFallback: const ['NajdArabicFallback'],
        bodyColor: text,
        displayColor: text,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      scrollbarTheme: ScrollbarThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => primary.withAlpha(
            states.contains(WidgetState.dragged) ? 235 : 170,
          ),
        ),
        trackColor: WidgetStatePropertyAll(scheme.outline.withAlpha(65)),
        radius: const Radius.circular(8),
        thickness: const WidgetStatePropertyAll(7),
        interactive: true,
      ),
      visualDensity: VisualDensity.standard,
    );
  }

  static ThemeData get dark => forBrightness(Brightness.dark);
  static ThemeData get light => forBrightness(Brightness.light);
}

class NajdThemeControl extends StatelessWidget {
  const NajdThemeControl({super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: NajdAppearance.instance,
    builder: (context, _) => ListTile(
      leading: const Icon(Icons.contrast),
      title: const Text('مظهر نجد'),
      subtitle: const Text('فاتح · داكن · حسب الجهاز'),
      trailing: DropdownButton<ThemeMode>(
        value: NajdAppearance.instance.mode,
        items: const [
          DropdownMenuItem(value: ThemeMode.light, child: Text('فاتح')),
          DropdownMenuItem(value: ThemeMode.dark, child: Text('داكن')),
          DropdownMenuItem(value: ThemeMode.system, child: Text('حسب الجهاز')),
        ],
        onChanged: (value) {
          if (value != null) unawaited(NajdAppearance.instance.setMode(value));
        },
      ),
    ),
  );
}

class NajdIntro extends StatefulWidget {
  const NajdIntro({
    super.key,
    required this.child,
    this.duration = const Duration(seconds: 14),
  });
  final Widget child;
  final Duration duration;
  @override
  State<NajdIntro> createState() => _NajdIntroState();
}

class _NajdIntroState extends State<NajdIntro> {
  Timer? _timer;
  late bool _visible;
  @override
  void initState() {
    super.initState();
    _visible =
        !Uri.base.queryParameters.containsKey('ref') &&
        !Uri.base.fragment.contains('najd_link=');
    if (_visible) _timer = Timer(widget.duration, _dismiss);
  }

  void _dismiss() {
    _timer?.cancel();
    if (mounted) setState(() => _visible = false);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      Offstage(offstage: _visible, child: widget.child),
      if (_visible)
        Material(
          color: Theme.of(context).scaffoldBackgroundColor,
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, bounds) => SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: bounds.maxHeight),
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Image.asset(
                          'assets/najd/mark.png',
                          width: bounds.maxWidth < 500 ? 124 : 176,
                          height: bounds.maxWidth < 500 ? 124 : 176,
                        ),
                        const Text(
                          'نجد',
                          style: TextStyle(
                            fontSize: 44,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          'Najd TV',
                          style: TextStyle(
                            fontSize: 18,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                        const SizedBox(height: 30),
                        Text(
                          'أن كان رمحك بأول الخيل ملحوم\nفـ أنا برمحي حـامي نجد كلـه\n\nمن شافنا بالحلم يقعد من النوم\nومن شـافنا بالعـلم بطـنـه يهلـه',
                          textAlign: TextAlign.center,
                          textDirection: TextDirection.rtl,
                          style: TextStyle(
                            fontSize: bounds.maxWidth < 500 ? 19 : 26,
                            height: 1.85,
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text('محمد بن قرملة'),
                        const SizedBox(height: 24),
                        TextButton(
                          autofocus: true,
                          onPressed: _dismiss,
                          child: const Text('متابعة إلى نجد'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
    ],
  );
}

class NajdTvViewport extends StatelessWidget {
  const NajdTvViewport({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    if (!isTvTarget) return child;
    final media = MediaQuery.of(context);
    final scale = (media.size.width / 1280).clamp(1.1, 1.6);
    return MediaQuery(
      data: media.copyWith(
        textScaler: TextScaler.linear(media.textScaler.scale(1) * scale),
      ),
      child: child,
    );
  }
}
