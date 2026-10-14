import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'src/api_client.dart';
import 'src/app_target.dart';
import 'src/details_page.dart';
import 'src/download_library_section.dart';
import 'src/library_store.dart';
import 'src/match_player_page.dart';
import 'src/models.dart';
import 'src/adaptive_viewport.dart';
import 'src/focus_highlight.dart';
import 'src/player_page.dart';
import 'src/virtual_pointer.dart';
import 'src/unified_media.dart';
import 'src/supabase_service.dart';

const _brandBg = Color(0xFF0B1220);
const _brandPanel = Color(0xFF151F32);
const _brandAccent = Color(0xFF708DB8);
const _brandAccentMuted = Color(0xFF526B94);
const _brandAccentLight = Color(0xFFDEE9F8);

void main() => runApp(const MitvApp());

class MitvApp extends StatefulWidget {
  const MitvApp({super.key});
  @override
  State<MitvApp> createState() => _MitvAppState();
}

class _MitvAppState extends State<MitvApp> {
  final _supabase = SupabaseService();
  late final Future<LocalLibraryStore> storeFuture =
      LocalLibraryStore.create(supabase: _supabase);
  final _pointer = VirtualPointerController();
  @override
  void dispose() {
    _supabase.close();
    _pointer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = ThemeData.dark(useMaterial3: true);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'MITV',
      builder: (context, child) => isTvTarget
          ? VirtualPointerScope(controller: _pointer, child: child!)
          : child!,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: base.copyWith(
        scaffoldBackgroundColor: _brandBg,
        appBarTheme: const AppBarTheme(
          backgroundColor: _brandBg,
          foregroundColor: Color(0xFFF6F7FB),
          centerTitle: true,
          elevation: 0,
        ),
        cardTheme: CardThemeData(
          color: _brandPanel,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: Color(0x55526B94)),
          ),
        ),
        colorScheme: ColorScheme.fromSeed(
          seedColor: _brandAccent,
          primary: _brandAccent,
          secondary: _brandAccentLight,
          surface: _brandPanel,
          brightness: Brightness.dark,
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: const Color(0xFF131E30),
          indicatorColor: const Color(0x554F688F),
          iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
                color: states.contains(WidgetState.selected)
                    ? _brandAccentLight
                    : const Color(0xFFC7CED8),
              )),
          labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(
                color: states.contains(WidgetState.selected)
                    ? _brandAccentLight
                    : const Color(0xFFD0D5DD),
                fontWeight: states.contains(WidgetState.selected)
                    ? FontWeight.w700
                    : FontWeight.w500,
              )),
        ),
        visualDensity:
            isTvTarget ? VisualDensity.comfortable : VisualDensity.standard,
      ),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: FutureBuilder<LocalLibraryStore>(
          future: storeFuture,
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              return const Scaffold(
                  body: Center(child: CircularProgressIndicator()));
            }
            return Shell(store: snapshot.data!, pointer: _pointer);
          },
        ),
      ),
    );
  }
}

void openDetails(BuildContext context, MitvApi api, LocalLibraryStore store,
    CatalogItem item) {
  api.rememberIdentity(item);
  Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => DetailsPage(api: api, store: store, item: item)));
}

class _MPlayMark extends StatelessWidget {
  const _MPlayMark({this.size = 38});
  final double size;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(painter: _MPlayPainter()),
      );
}

class _MPlayPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * .10
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round
      ..color = _brandAccent;
    final m = Path()
      ..moveTo(size.width * .2, size.height * .78)
      ..lineTo(size.width * .2, size.height * .22)
      ..lineTo(size.width * .5, size.height * .50)
      ..lineTo(size.width * .8, size.height * .22)
      ..lineTo(size.width * .8, size.height * .78);
    canvas.drawPath(m, stroke);
    final play = Path()
      ..moveTo(size.width * .43, size.height * .55)
      ..lineTo(size.width * .43, size.height * .76)
      ..lineTo(size.width * .63, size.height * .655)
      ..close();
    canvas.drawPath(play, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _BrandTitle extends StatelessWidget {
  const _BrandTitle();
  @override
  Widget build(BuildContext context) => const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _MPlayMark(size: 38),
          SizedBox(width: 10),
          Text('MITV',
              style: TextStyle(
                  color: _brandAccentLight,
                  fontWeight: FontWeight.w800,
                  letterSpacing: .2)),
        ],
      );
}

class ConfiguredTvChannel {
  const ConfiguredTvChannel(
      {required this.title, required this.package, required this.sourceRef});
  final String title;
  final String package;
  final String sourceRef;
}

class Shell extends StatefulWidget {
  const Shell(
      {super.key,
      required this.store,
      this.api,
      this.pointer,
      this.channels = const [],
      this.clearCache,
      this.clearDownloads});
  final LocalLibraryStore store;
  final MitvApi? api;
  final VirtualPointerController? pointer;
  final List<ConfiguredTvChannel> channels;
  final Future<void> Function()? clearCache;
  final Future<void> Function()? clearDownloads;
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int index = 1;
  late final MitvApi api;
  late final bool _ownsApi;
  final _pages = List<Widget?>.filled(6, null);
  @override
  void initState() {
    super.initState();
    _ownsApi = widget.api == null;
    api = widget.api ?? MitvApi();
    _pages[index] = _createPage(index);
    final ref = kIsWeb ? Uri.base.queryParameters['ref'] ?? '' : '';
    if (['alooy:', '3isk:', 'legacy:'].any(ref.startsWith)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          openDetails(
              context,
              api,
              widget.store,
              CatalogItem(
                  id: ref,
                  title: 'التفاصيل',
                  poster: '',
                  type: 'series',
                  ref: ref));
        }
      });
    }
  }

  @override
  void dispose() {
    if (_ownsApi) api.close();
    super.dispose();
  }

  Widget _createPage(int page) => switch (page) {
        0 => LivePage(api: api, store: widget.store, channels: widget.channels),
        1 => HomePage(api: api, store: widget.store),
        2 => CatalogPage(
            api: api,
            store: widget.store,
            title: 'الأفلام',
            categoryId: 'movie-foreign',
            mediaKind: 'movie',
            unified: true),
        3 => CatalogPage(
            api: api,
            store: widget.store,
            title: 'المسلسلات',
            categoryId: 'series-foreign',
            mediaKind: 'series',
            unified: true),
        4 => CatalogPage(
            api: api,
            store: widget.store,
            title: 'الأنمي',
            categoryId: 'movie-anime',
            mediaKind: 'anime',
            unified: true),
        5 => SettingsPage(
            api: api,
            store: widget.store,
            pointer: widget.pointer,
            clearCache: widget.clearCache,
            clearDownloads: widget.clearDownloads),
        _ => throw RangeError.index(page, _pages)
      };
  void _selectPage(int value) {
    if (index == value) return;
    setState(() {
      _pages[value] ??= _createPage(value);
      index = value;
    });
  }

  static const _labels = [
    'المباشر',
    'الرئيسية',
    'الأفلام',
    'المسلسلات',
    'الأنمي',
    'الإعدادات'
  ];
  static const _icons = [
    Icons.live_tv,
    Icons.home_outlined,
    Icons.movie_outlined,
    Icons.video_library_outlined,
    Icons.animation,
    Icons.settings_outlined
  ];
  @override
  Widget build(BuildContext context) =>
      AdaptiveViewport(builder: (context, viewport) {
        final content = IndexedStack(
            index: index,
            children: _pages
                .map((page) => page ?? const SizedBox.shrink())
                .toList(growable: false));
        final side =
            isTvTarget || viewport.usesSideNavigation || isDesktopTarget;
        return Scaffold(
            appBar: AppBar(title: const _BrandTitle()),
            body: SafeArea(
                top: false,
                child: side
                    ? FocusTraversalGroup(
                        child: Row(children: [
                        NavigationRail(
                            extended: viewport.size.width >= 700,
                            selectedIndex: index,
                            onDestinationSelected: _selectPage,
                            destinations: List.generate(
                                _labels.length,
                                (i) => NavigationRailDestination(
                                    icon: Icon(_icons[i]),
                                    label: Text(_labels[i])))),
                        const VerticalDivider(width: 1),
                        Expanded(child: content)
                      ]))
                    : content),
            bottomNavigationBar: side
                ? null
                : NavigationBar(
                    selectedIndex: index,
                    onDestinationSelected: _selectPage,
                    destinations: List.generate(
                        _labels.length,
                        (i) => NavigationDestination(
                            icon: Icon(_icons[i]), label: _labels[i]))));
      });
}

void _openLibrary(BuildContext context, MitvApi api, LocalLibraryStore store) =>
    Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => Scaffold(
            appBar: AppBar(title: const Text('مكتبتي والتنزيلات')),
            body: LibraryPage(api: api, store: store))));

class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.api, required this.store});
  final MitvApi api;
  final LocalLibraryStore store;
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late final Future<List<CatalogItem>> _latest =
      widget.api.category('3isk-latest');
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) =>
          ListView(padding: const EdgeInsets.all(16), children: [
            FutureBuilder<List<CatalogItem>>(
                future: _latest,
                builder: (context, snapshot) {
                  if (!snapshot.hasData || snapshot.data!.isEmpty) {
                    return const SizedBox.shrink();
                  }
                  final item = snapshot.data!.first;
                  return FocusHighlight(
                      child: ClipRRect(
                          borderRadius: BorderRadius.circular(20),
                          child: LayoutBuilder(
                              builder: (context, bounds) => SizedBox(
                                  height:
                                      (bounds.maxWidth * .45).clamp(220, 400),
                                  child: Stack(fit: StackFit.expand, children: [
                                    if (item.poster.isNotEmpty)
                                      Image.network(item.poster,
                                          fit: BoxFit.cover,
                                          cacheWidth: 1000,
                                          errorBuilder: (_, __, ___) =>
                                              const SizedBox.shrink()),
                                    const DecoratedBox(
                                        decoration: BoxDecoration(
                                            gradient: LinearGradient(
                                                begin: Alignment.topCenter,
                                                end: Alignment.bottomCenter,
                                                colors: [
                                          Colors.black26,
                                          Color(0xF00B1220)
                                        ]))),
                                    Padding(
                                        padding: const EdgeInsets.all(20),
                                        child: Column(
                                            mainAxisAlignment:
                                                MainAxisAlignment.end,
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              const Text('أحدث الإضافات'),
                                              const SizedBox(height: 8),
                                              Text(item.title,
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .headlineSmall),
                                              const SizedBox(height: 12),
                                              FilledButton.icon(
                                                  onPressed: () => openDetails(
                                                      context,
                                                      widget.api,
                                                      widget.store,
                                                      item),
                                                  icon: const Icon(
                                                      Icons.play_arrow),
                                                  label: const Text(
                                                      'التفاصيل والتشغيل'))
                                            ]))
                                  ])))));
                }),
            const SizedBox(height: 16),
            Wrap(spacing: 12, runSpacing: 8, children: [
              FilledButton.tonalIcon(
                  onPressed: () =>
                      _openLibrary(context, widget.api, widget.store),
                  icon: const Icon(Icons.bookmark_outline),
                  label: const Text('مكتبتي والتنزيلات')),
              FilledButton.tonalIcon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => Scaffold(
                          appBar: AppBar(title: const Text('البحث')),
                          body: SearchPage(
                              api: widget.api, store: widget.store)))),
                  icon: const Icon(Icons.search),
                  label: const Text('البحث'))
            ]),
            const SizedBox(height: 24),
            Text('أكمل المشاهدة',
                style: Theme.of(context).textTheme.titleLarge),
            if (widget.store.continueWatching.isEmpty)
              const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('ستظهر الأعمال التي تتابعها هنا')),
            for (final entry in widget.store.continueWatching)
              FocusHighlight(
                  child: ListTile(
                      title: Text(entry.title,
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                      subtitle: LinearProgressIndicator(
                          value: entry.durationMs > 0 ? entry.progress : null),
                      leading: const Icon(Icons.play_circle_outline),
                      onTap: () => openDetails(context, widget.api,
                          widget.store, entry.catalogItem))),
          ]));
}

class LivePage extends StatelessWidget {
  const LivePage(
      {super.key,
      required this.api,
      required this.store,
      this.channels = const []});
  final MitvApi api;
  final LocalLibraryStore store;
  final List<ConfiguredTvChannel> channels;
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(child: MatchesPage(api: api, store: store)),
        Padding(
            padding: const EdgeInsets.all(16),
            child: Text('القنوات المباشرة',
                style: Theme.of(context).textTheme.titleLarge)),
        if (channels.isEmpty)
          const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 24),
              child: Text('لا توجد قنوات مباشرة مهيأة حاليًا')),
        if (channels.isNotEmpty)
          Expanded(
              child: ListView(children: [
            for (final package in channels.map((c) => c.package).toSet()) ...[
              Padding(padding: const EdgeInsets.all(12), child: Text(package)),
              for (final channel in channels.where((c) => c.package == package))
                FocusHighlight(
                    child: ListTile(
                        title: Text(channel.title),
                        leading: const Icon(Icons.live_tv),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => PlayerPage(
                                    api: api,
                                    store: store,
                                    item: CatalogItem(
                                        id: channel.sourceRef,
                                        title: channel.title,
                                        poster: '',
                                        type: 'live',
                                        ref: channel.sourceRef),
                                    title: channel.title,
                                    sourceRef: channel.sourceRef,
                                    isLive: true)))))
            ]
          ]))
      ]);
}

class SettingsPage extends StatefulWidget {
  const SettingsPage(
      {super.key,
      required this.api,
      required this.store,
      this.pointer,
      this.clearCache,
      this.clearDownloads});
  final MitvApi api;
  final LocalLibraryStore store;
  final VirtualPointerController? pointer;
  final Future<void> Function()? clearCache;
  final Future<void> Function()? clearDownloads;
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _busy = false;
  Future<void> _clear(String title, Future<void> Function() action) async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
                title: Text(title),
                content:
                    const Text('تأكيد حذف البيانات المحددة من هذا الجهاز؟'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('إلغاء')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('حذف'))
                ]));
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('تعذر إكمال التنظيف')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const ListTile(
            title: Text('MITV'), subtitle: Text('المظهر الليلي الأزرق الهادئ')),
        FocusHighlight(
            child: ListTile(
                title: const Text('مكتبتي والتنزيلات'),
                leading: const Icon(Icons.video_library_outlined),
                onTap: () => _openLibrary(context, widget.api, widget.store))),
        if (isTvTarget && widget.pointer != null)
          AnimatedBuilder(
              animation: widget.pointer!,
              builder: (context, _) => SwitchListTile(
                  title: const Text('الفأرة الافتراضية'),
                  subtitle: const Text(
                      'زر القائمة أو F8 للتبديل؛ الأسهم للحركة وOK للاختيار'),
                  value: widget.pointer!.enabled,
                  onChanged: widget.pointer!.setEnabled)),
        if (widget.clearCache != null)
          ListTile(
              title: const Text('مسح الكاش المحلي'),
              leading: const Icon(Icons.cleaning_services_outlined),
              enabled: !_busy,
              onTap: () => _clear('مسح الكاش المحلي', widget.clearCache!)),
        if (!kIsWeb && widget.clearDownloads != null)
          ListTile(
              title: const Text('حذف الملفات المحمّلة'),
              leading: const Icon(Icons.delete_outline),
              enabled: !_busy,
              onTap: () =>
                  _clear('حذف الملفات المحمّلة', widget.clearDownloads!)),
        ListTile(
            title: const Text('مسح سجل المشاهدة'),
            enabled: !_busy,
            leading: const Icon(Icons.history),
            onTap: () => _clear('مسح سجل المشاهدة', widget.store.clearHistory)),
        ListTile(
            title: const Text('مسح سجل البحث'),
            enabled: !_busy,
            leading: const Icon(Icons.search_off),
            onTap: () =>
                _clear('مسح سجل البحث', widget.store.clearSearchHistory)),
        if (_busy) const LinearProgressIndicator()
      ]);
}

String _matchStatusLabel(String status) {
  switch (status.trim().toLowerCase()) {
    case 'live':
      return 'جاري الآن';
    case 'ended':
      return 'انتهت';
    case 'scheduled':
      return 'لم تبدأ';
    default:
      return status;
  }
}

String _localizedMatchTime(String time) => time
    .replaceAll(RegExp(r'\bPM\b', caseSensitive: false), 'م')
    .replaceAll(RegExp(r'\bAM\b', caseSensitive: false), 'ص');

class _TeamBadge extends StatelessWidget {
  const _TeamBadge({required this.name, required this.logo});
  final String name;
  final String logo;
  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, bounds) {
        final diameter = bounds.maxWidth.clamp(0.0, isTvTarget ? 82.0 : 62.0);
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: diameter,
              height: diameter,
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF1B293D),
                border: Border.all(color: const Color(0x44526B94)),
              ),
              child: logo.isEmpty
                  ? const Icon(Icons.shield_outlined, color: _brandAccentMuted)
                  : Image.network(
                      logo,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(
                          Icons.shield_outlined,
                          color: _brandAccentMuted),
                    ),
            ),
            const SizedBox(height: 7),
            Text(name,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ],
        );
      });
}

class MatchesPage extends StatefulWidget {
  final LocalLibraryStore store;
  const MatchesPage({super.key, required this.api, required this.store});
  final MitvApi api;

  @override
  State<MatchesPage> createState() => _MatchesPageState();
}

class _MatchesPageState extends State<MatchesPage> {
  late Future<List<MatchItem>> _matches;
  final _carousel = ScrollController();
  @override
  void dispose() {
    _carousel.dispose();
    super.dispose();
  }

  void _scrollMatches(int direction) {
    if (!_carousel.hasClients) return;
    _carousel.animateTo(
        (_carousel.offset +
                direction * _carousel.position.viewportDimension * .8)
            .clamp(0, _carousel.position.maxScrollExtent),
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut);
  }

  @override
  void initState() {
    super.initState();
    _matches = widget.api.matches();
  }

  @override
  void didUpdateWidget(covariant MatchesPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) _matches = widget.api.matches();
  }

  void _reload() {
    final next = widget.api.matches();
    setState(() {
      _matches = next;
    });
  }

  void _open(BuildContext context, MatchItem match) {
    if (match.status == 'ended') {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('المباراة انتهت ولا يوجد بث مباشر الآن.')));
      return;
    }
    if (match.ref.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('مرجع تشغيل المباراة غير متاح حاليًا.')));
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => MatchPlayerPage(
            api: widget.api, match: match, store: widget.store)));
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        Row(children: [
          const Expanded(
              child: Padding(
                  padding: EdgeInsets.all(16), child: Text('مباريات اليوم'))),
          if (MediaQuery.sizeOf(context).width >= 700) ...[
            IconButton(
                tooltip: 'المباريات السابقة',
                onPressed: () => _scrollMatches(-1),
                icon: const Icon(Icons.chevron_right)),
            IconButton(
                tooltip: 'المباريات التالية',
                onPressed: () => _scrollMatches(1),
                icon: const Icon(Icons.chevron_left))
          ],
          IconButton(
              key: const Key('matches-refresh'),
              tooltip: 'تحديث المباريات',
              onPressed: _reload,
              icon: const Icon(Icons.refresh))
        ]),
        Expanded(
            child: FutureBuilder<List<MatchItem>>(
          future: _matches,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return const _ErrorState('تعذر تحميل المباريات حاليًا');
            }
            final items = snapshot.data ?? const [];
            if (items.isEmpty) {
              return const _ErrorState('لا توجد مباريات متاحة الآن');
            }
            return LayoutBuilder(
                builder: (context, bounds) => Align(
                    alignment: Alignment.topCenter,
                    child: SizedBox(
                        height: bounds.maxHeight.clamp(160, 260),
                        width: bounds.maxWidth,
                        child: ListView.builder(
                          key: const Key('live-match-carousel'),
                          controller: _carousel,
                          scrollDirection: Axis.horizontal,
                          padding: EdgeInsets.all(isTvTarget ? 24 : 12),
                          itemCount: items.length,
                          itemBuilder: (context, i) {
                            final m = items[i];
                            final time = _localizedMatchTime(m.time);
                            final status = _matchStatusLabel(m.status);
                            final score = m.hasScore
                                ? '${m.homeGoals} - ${m.awayGoals}'
                                : null;
                            final center = m.status == 'scheduled'
                                ? (time.isEmpty ? 'موعد غير متاح' : time)
                                : (score ?? 'النتيجة غير متاحة');
                            return FocusHighlight(
                                child: SizedBox(
                                    width: (bounds.maxWidth /
                                            (bounds.maxWidth >= 900
                                                ? 2.6
                                                : bounds.maxWidth >= 600
                                                    ? 1.8
                                                    : 1.08))
                                        .clamp(240, 460),
                                    child: Card(
                                      clipBehavior: Clip.antiAlias,
                                      child: InkWell(
                                        onTap: () => _open(context, m),
                                        canRequestFocus: true,
                                        child: Padding(
                                          padding: EdgeInsets.symmetric(
                                              horizontal: isTvTarget ? 24 : 14,
                                              vertical: isTvTarget ? 22 : 16),
                                          child: Row(
                                            children: [
                                              Expanded(
                                                  child: _TeamBadge(
                                                      name: m.home,
                                                      logo: m.homeLogo)),
                                              SizedBox(
                                                width: isTvTarget ? 180 : 110,
                                                child: Column(
                                                  children: [
                                                    Text(status,
                                                        style: TextStyle(
                                                            color: m.status ==
                                                                    'live'
                                                                ? Colors
                                                                    .redAccent
                                                                : const Color(
                                                                    0xFFBEB7A7))),
                                                    const SizedBox(height: 8),
                                                    Text(center,
                                                        style: TextStyle(
                                                            fontSize: isTvTarget
                                                                ? 28
                                                                : 20,
                                                            fontWeight:
                                                                FontWeight
                                                                    .w800)),
                                                    if (m.competition
                                                        .isNotEmpty) ...[
                                                      const SizedBox(height: 6),
                                                      Text(m.competition,
                                                          textAlign:
                                                              TextAlign.center,
                                                          maxLines: 1,
                                                          overflow: TextOverflow
                                                              .ellipsis,
                                                          style: const TextStyle(
                                                              color: Color(
                                                                  0xFF9E9686),
                                                              fontSize: 12)),
                                                    ],
                                                  ],
                                                ),
                                              ),
                                              Expanded(
                                                  child: _TeamBadge(
                                                      name: m.away,
                                                      logo: m.awayLogo)),
                                            ],
                                          ),
                                        ),
                                      ),
                                    )));
                          },
                        ))));
          },
        ))
      ]);
}

class CatalogPage extends StatefulWidget {
  const CatalogPage(
      {super.key,
      required this.api,
      required this.store,
      required this.title,
      required this.categoryId,
      this.unified = false,
      this.mediaKind});
  final MitvApi api;
  final LocalLibraryStore store;
  final String title;
  final String categoryId;
  final bool unified;
  final String? mediaKind;
  @override
  State<CatalogPage> createState() => _CatalogPageState();
}

class _CatalogPageState extends State<CatalogPage> {
  late String selectedCategory = widget.categoryId;
  static const seriesCategories = <String, String>{
    'series-foreign': 'مسلسلات أجنبية',
    'series-arabic': 'مسلسلات عربية',
    'series-turkish': 'مسلسلات تركية',
    'series-asian': 'مسلسلات آسيوية',
    '3isk-dubbed': 'مسلسلات مدبلجة',
    'laroza-series': 'مسلسلات مختارة',
  };
  static const movieCategories = <String, String>{
    'movie-foreign': 'أفلام أجنبية',
    'movie-arabic': 'أفلام عربية',
    'movie-turkish': 'أفلام تركية',
    'movie-asian': 'أفلام آسيوية',
    'movie-indian': 'أفلام هندية',
    'laroza-movies': 'أفلام مختارة',
  };
  static const animeCategories = <String, String>{
    'series-anime': 'مسلسلات أنمي',
    'movie-anime': 'أفلام أنمي',
    'laroza-anime': 'أنمي مختار',
  };
  Map<String, String> get _categories {
    switch (widget.mediaKind) {
      case 'movie':
        return movieCategories;
      case 'series':
        return seriesCategories;
      case 'anime':
        return animeCategories;
      default:
        return widget.unified
            ? {
                ...movieCategories,
                ...seriesCategories,
                ...animeCategories,
              }
            : seriesCategories;
    }
  }

  bool _matchesKind(CatalogItem item) {
    return widget.mediaKind == null ||
        MediaTaxonomy.classify(item) == widget.mediaKind;
  }

  final controller = ScrollController();
  final items = <CatalogItem>[];
  int page = 0;
  bool loading = false;
  bool done = false;
  String? error;
  int requestGeneration = 0;
  @override
  void initState() {
    super.initState();
    controller.addListener(_onScroll);
    _loadMore();
  }

  @override
  void dispose() {
    requestGeneration += 1;
    controller.dispose();
    super.dispose();
  }

  void _onScroll() {
    _prefetchVisible();
    if (controller.position.extentAfter < (isTvTarget ? 1400 : 900)) {
      _loadMore();
    }
  }

  final _prefetched = <String>{};
  void _prefetchVisible() {
    if (!mounted || !controller.hasClients || items.isEmpty) return;
    final columns = ViewportMetrics(
            size: MediaQuery.sizeOf(context),
            safeInsets: MediaQuery.viewPaddingOf(context),
            textScaler: MediaQuery.textScalerOf(context))
        .columns(minimumCardWidth: isTvTarget ? 200 : 160);
    final width = MediaQuery.sizeOf(context).width / columns;
    final rowHeight = width / (isTvTarget ? .68 : .62) + 18;
    final start = ((controller.offset / rowHeight).floor() * columns)
        .clamp(0, items.length);
    for (final item in items.skip(start).take(columns * 2)) {
      if (!_prefetched.add(item.ref)) continue;
      if (item.poster.isNotEmpty) {
        unawaited(precacheImage(
            ResizeImage(NetworkImage(item.poster), width: 320), context,
            onError: (_, __) {}));
      }
      unawaited(widget.api.prefetchMetadata(item.ref));
    }
  }

  Future<void> _loadMore() async {
    if (loading || done) return;
    final generation = requestGeneration;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final next = await widget.api.category(selectedCategory, page: page + 1);
      if (!mounted || generation != requestGeneration) return;
      final previousCount = items.length;
      final merged = UnifiedMedia.mergeSources([...items, ...next])
          .where((item) => item.ref.isNotEmpty && _matchesKind(item))
          .toList(growable: false);
      final hasMore = widget.api.categoryHasMore(selectedCategory, page + 1);
      setState(() {
        page += 1;
        items
          ..clear()
          ..addAll(merged);
        done = hasMore == null ? next.isEmpty : !hasMore;
        loading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted ||
            generation != requestGeneration ||
            !controller.hasClients) {
          return;
        }
        _prefetchVisible();
        if (items.length > previousCount &&
            controller.position.extentAfter < (isTvTarget ? 1400 : 900)) {
          _loadMore();
        }
      });
    } catch (_) {
      if (mounted && generation == requestGeneration) {
        setState(() {
          loading = false;
          error = 'تعذر تحميل المزيد. اسحب للأسفل للمحاولة مجددًا.';
        });
      }
    }
  }

  Future<void> _refresh() async {
    requestGeneration += 1;
    setState(() {
      items.clear();
      _prefetched.clear();
      page = 0;
      done = false;
      loading = false;
      error = null;
    });
    await _loadMore();
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        if (widget.unified ||
            widget.categoryId.startsWith('series-') ||
            widget.categoryId.startsWith('3isk-'))
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: DropdownButton<String>(
              isExpanded: true,
              value: selectedCategory,
              items: _categories.entries
                  .map((entry) => DropdownMenuItem(
                      value: entry.key, child: Text(entry.value)))
                  .toList(),
              onChanged: (value) {
                if (value == null || value == selectedCategory) return;
                setState(() {
                  selectedCategory = value;
                });
                if (controller.hasClients) controller.jumpTo(0);
                unawaited(_refresh());
              },
            ),
          ),
        Expanded(
            child: RefreshIndicator(
          onRefresh: _refresh,
          child: GridView.builder(
            controller: controller,
            padding: EdgeInsets.all(isTvTarget ? 24 : 12),
            gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: isTvTarget ? 260 : 220,
                childAspectRatio: isTvTarget ? .68 : .62,
                crossAxisSpacing: isTvTarget ? 18 : 10,
                mainAxisSpacing: isTvTarget ? 18 : 10),
            itemCount: items.length + 1,
            itemBuilder: (context, i) {
              if (i == items.length) {
                return Center(
                    child: loading
                        ? const CircularProgressIndicator()
                        : error != null
                            ? TextButton.icon(
                                onPressed: _loadMore,
                                icon: const Icon(Icons.refresh),
                                label: const Text('إعادة المحاولة'))
                            : done
                                ? const Text('تم عرض كل الأعمال المتاحة')
                                : TextButton.icon(
                                    onPressed: _loadMore,
                                    icon: const Icon(Icons.expand_more),
                                    label: const Text('عرض الصفحة التالية')));
              }
              final item = items[i];
              return _CatalogCard(
                  item: item,
                  onTap: () =>
                      openDetails(context, widget.api, widget.store, item));
            },
          ),
        )),
      ]);
}

class _CatalogCard extends StatelessWidget {
  const _CatalogCard({required this.item, required this.onTap});
  final CatalogItem item;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => FocusHighlight(
          child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          canRequestFocus: true,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(
              child: item.poster.isEmpty
                  ? const ColoredBox(
                      color: Color(0xFF162235),
                      child: Center(
                          child: Icon(Icons.movie_outlined,
                              color: _brandAccentMuted, size: 42)))
                  : Image.network(
                      item.poster,
                      cacheWidth: 320,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const ColoredBox(
                          color: Color(0xFF162235),
                          child: Center(
                              child: Icon(Icons.broken_image_outlined,
                                  color: _brandAccentMuted, size: 38))),
                    ),
            ),
            Padding(
              padding: EdgeInsets.all(isTvTarget ? 12 : 8),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 3),
                    Text(
                        [
                          switch (MediaTaxonomy.classify(item)) {
                            'movie' => 'فيلم',
                            'series' => 'مسلسل',
                            'anime' => 'أنمي',
                            'program' => 'برنامج',
                            _ => 'عمل',
                          },
                          if (item.year != null) '${item.year}'
                        ].join(' • '),
                        style: const TextStyle(
                            color: Color(0xFFB8B09F), fontSize: 12)),
                  ]),
            ),
          ]),
        ),
      ));
}

class SearchPage extends StatefulWidget {
  const SearchPage({super.key, required this.api, required this.store});
  final MitvApi api;
  final LocalLibraryStore store;
  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final query = TextEditingController();
  List<CatalogItem> items = const [];
  bool loading = false;
  bool submitted = false;
  String? error;
  Timer? debounce;
  int generation = 0;

  @override
  void dispose() {
    generation += 1;
    debounce?.cancel();
    query.dispose();
    super.dispose();
  }

  void onQueryChanged(String value) {
    debounce?.cancel();
    final q = value.trim();
    if (q.isEmpty) {
      generation += 1;
      setState(() {
        items = const [];
        loading = false;
        submitted = false;
        error = null;
      });
      return;
    }
    if (q.length < 2) return;
    debounce = Timer(const Duration(milliseconds: 450), () => run(q));
  }

  Future<void> run([String? requested]) async {
    final q = (requested ?? query.text).trim();
    if (q.isEmpty) return;
    final request = ++generation;
    setState(() {
      loading = true;
      submitted = true;
      error = null;
    });
    try {
      final result = await widget.api.search(q);
      if (!mounted || request != generation || q != query.text.trim()) return;
      setState(() {
        items = result;
        loading = false;
      });
    } catch (_) {
      if (!mounted || request != generation) return;
      setState(() {
        items = const [];
        loading = false;
        error = 'تعذر البحث حاليًا. أعد المحاولة.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.all(isTvTarget ? 24 : 12),
        child: Column(children: [
          TextField(
            controller: query,
            textInputAction: TextInputAction.search,
            onChanged: onQueryChanged,
            onSubmitted: (_) => run(),
            decoration: InputDecoration(
              hintText: 'ابحث عن فيلم أو مسلسل',
              suffixIcon: IconButton(
                  onPressed: loading ? null : () => run(),
                  icon: const Icon(Icons.search)),
            ),
          ),
          if (loading) const LinearProgressIndicator(),
          const SizedBox(height: 10),
          Expanded(
            child: error != null
                ? Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton.tonal(
                        onPressed: () => run(),
                        child: const Text('إعادة المحاولة')),
                  ]))
                : submitted && !loading && items.isEmpty
                    ? const Center(
                        child: Text('لا توجد نتائج لهذا البحث حاليًا'))
                    : !submitted
                        ? const Center(
                            child: Text('اكتب اسم فيلم أو مسلسل للبحث'))
                        : GridView.builder(
                            gridDelegate:
                                SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: isTvTarget ? 260 : 220,
                              childAspectRatio: isTvTarget ? .68 : .62,
                              crossAxisSpacing: isTvTarget ? 18 : 10,
                              mainAxisSpacing: isTvTarget ? 18 : 10,
                            ),
                            itemCount: items.length,
                            itemBuilder: (context, i) => _CatalogCard(
                              item: items[i],
                              onTap: () => openDetails(
                                  context, widget.api, widget.store, items[i]),
                            ),
                          ),
          ),
        ]),
      );
}

class LibraryPage extends StatelessWidget {
  const LibraryPage({super.key, required this.api, required this.store});
  final MitvApi api;
  final LocalLibraryStore store;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: store,
        builder: (context, _) {
          final favorites = store.favorites;
          final watching = store.continueWatching;
          final history = store.history;
          return ListView(
            padding: EdgeInsets.all(isTvTarget ? 24 : 12),
            children: [
              Text('المفضلة', style: Theme.of(context).textTheme.titleLarge),
              if (favorites.isEmpty)
                const ListTile(title: Text('لا توجد عناصر مفضلة بعد')),
              ...favorites.map((item) => ListTile(
                    leading: const Icon(Icons.favorite),
                    title: Text(item.title),
                    onTap: () => openDetails(context, api, store, item),
                  )),
              const SizedBox(height: 18),
              Text('أكمل المشاهدة',
                  style: Theme.of(context).textTheme.titleLarge),
              if (watching.isEmpty)
                const ListTile(title: Text('لا توجد مشاهدة غير مكتملة')),
              ...watching.map((entry) => ListTile(
                    leading: const Icon(Icons.play_circle_outline),
                    title: Text(entry.title),
                    subtitle: LinearProgressIndicator(
                        value: entry.durationMs > 0 ? entry.progress : null),
                    onTap: () =>
                        openDetails(context, api, store, entry.catalogItem),
                  )),
              const SizedBox(height: 18),
              const DownloadLibrarySection(),
              const SizedBox(height: 18),
              Row(children: [
                Expanded(
                    child: Text('السجل',
                        style: Theme.of(context).textTheme.titleLarge)),
                if (history.isNotEmpty)
                  TextButton(
                      onPressed: store.clearHistory,
                      child: const Text('مسح السجل')),
              ]),
              if (history.isEmpty)
                const ListTile(title: Text('سجل المشاهدة فارغ')),
              ...history.map((entry) => ListTile(
                    leading: const Icon(Icons.history),
                    title: Text(entry.title),
                    subtitle: Text(entry.episodeNumber == null
                        ? 'آخر مشاهدة'
                        : 'الحلقة ${entry.episodeNumber}'),
                    onTap: () =>
                        openDetails(context, api, store, entry.catalogItem),
                  )),
            ],
          );
        },
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => Center(
      child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(message, textAlign: TextAlign.center)));
}
