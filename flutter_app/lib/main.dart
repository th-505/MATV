import 'src/account_settings.dart';
import 'src/font_addons.dart';
import 'src/favorite_refresh.dart';
import 'src/najd_theme.dart';

import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'src/ui_contract.dart';

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
import 'src/storage_cleanup.dart';
import 'src/cloud_library.dart';

bool _fontLicensesRegistered = false;
const _brandAccent = NajdUi.accent;
const _brandAccentMuted = NajdUi.accentLight;

void main() => runApp(const MitvApp());

class MitvApp extends StatefulWidget {
  const MitvApp({super.key});
  @override
  State<MitvApp> createState() => _MitvAppState();
}

class _MitvAppState extends State<MitvApp> {
  late final Future<LocalLibraryStore> storeFuture = LocalLibraryStore.create();
  final _pointer = VirtualPointerController();
  late final Future<CloudLibrarySync?> _cloudFuture;
  @override
  void initState() {
    super.initState();
    if (!_fontLicensesRegistered) {
      _fontLicensesRegistered = true;
      LicenseRegistry.addLicense(() async* {
        yield LicenseEntryWithLineBreaks([
          'Noto Sans Arabic',
        ], await rootBundle.loadString('assets/fallback/OFL.txt'));
      });
    }
    unawaited(NajdAppearance.instance.load());
    unawaited(loadPrivateNajdFonts().then((_) => NajdFontAddon.restore()));
    _cloudFuture = storeFuture
        .then(CloudLibrarySync.startDefault)
        .catchError((Object _, StackTrace _) => null);
    unawaited(_cloudFuture);
  }

  @override
  void dispose() {
    _pointer.dispose();
    unawaited(CloudLibrarySync.closeDefault());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: NajdAppearance.instance,
      builder: (context, _) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: NajdUi.brand,
        theme: NajdThemes.light,
        darkTheme: NajdThemes.dark,
        themeMode: NajdAppearance.instance.mode,
        builder: (context, child) => NajdTvViewport(
          child: NajdIntro(
            child: isTvTarget
                ? VirtualPointerScope(controller: _pointer, child: child!)
                : child!,
          ),
        ),
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: FutureBuilder<LocalLibraryStore>(
            future: storeFuture,
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return const Scaffold(
                  body: Center(child: CircularProgressIndicator()),
                );
              }
              return Shell(store: snapshot.data!, pointer: _pointer);
            },
          ),
        ),
      ),
    );
  }
}

void openDetails(
  BuildContext context,
  MitvApi api,
  LocalLibraryStore store,
  CatalogItem item,
) {
  api.rememberIdentity(item);
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => DetailsPage(api: api, store: store, item: item),
    ),
  );
}

class _NajdMark extends StatelessWidget {
  const _NajdMark({this.size = 38});
  final double size;
  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/najd/mark.png',
    width: size,
    height: size,
    semanticLabel: 'نجد',
  );
}

class _BrandTitle extends StatelessWidget {
  const _BrandTitle();
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      _NajdMark(size: 38),
      SizedBox(width: 10),
      Flexible(
        child: Text(
          NajdUi.brand,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: Theme.of(context).colorScheme.primary,
            fontWeight: FontWeight.w800,
            letterSpacing: .2,
          ),
        ),
      ),
    ],
  );
}

class ConfiguredTvChannel {
  const ConfiguredTvChannel({
    required this.title,
    required this.package,
    required this.sourceRef,
  });
  final String title;
  final String package;
  final String sourceRef;
}

class Shell extends StatefulWidget {
  const Shell({
    super.key,
    required this.store,
    this.api,
    this.pointer,
    this.channels = const [],
    this.clearCache,
    this.clearDownloads,
  });
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
  int index = 0;
  bool _drawerOpen = false;
  bool _headerVisible = true;
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _menuFocus = FocusNode(debugLabel: 'open-navigation');
  final _navFocus = List.generate(
    NajdUi.pageIds.length + NajdUi.regions.length,
    (i) => FocusNode(
      debugLabel:
          'nav-${i < NajdUi.pageIds.length ? NajdUi.pageIds[i] : NajdUi.regions[i - NajdUi.pageIds.length].id}',
    ),
  );
  int _pageGeneration = 0;
  late final MitvApi api;
  late final bool _ownsApi;
  final _pages = List<Widget?>.filled(NajdUi.pageIds.length, null);
  @override
  void initState() {
    super.initState();
    _ownsApi = widget.api == null;
    api = widget.api ?? MitvApi();
    _pages[index] = _createPage(index);
    if (kIsWeb && Uri.base.fragment.contains('najd_link=')) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => const NajdAccountPage()));
        }
      });
    }
    final ref = kIsWeb ? Uri.base.queryParameters['ref'] ?? '' : '';
    if (['alooy:', '3isk:', 'legacy:', 'laroza:'].any(ref.startsWith)) {
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
              ref: ref,
            ),
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _menuFocus.dispose();
    for (final node in _navFocus) {
      node.dispose();
    }
    if (_ownsApi) api.close();
    super.dispose();
  }

  Future<void> _clearBrowsingCache() async {
    await widget.clearCache?.call();
    api.clearBrowsingCache();
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    if (!mounted) return;
    setState(() {
      _pageGeneration++;
      for (var i = 0; i < _pages.length; i++) {
        if (i != 8) _pages[i] = null;
      }
      // Settings owns the confirmation/action in progress. If navigation
      // changed while it was awaiting, recreate only the newly visible tab.
      if (index != 8) _pages[index] = _createPage(index);
    });
  }

  Future<void> _clearDownloads() async {
    if (widget.clearDownloads != null) {
      await widget.clearDownloads!();
    } else {
      await StorageCleanup.clearDownloads();
    }
  }

  Widget _createPage(int page) => switch (page) {
    0 => HomePage(api: api, store: widget.store, onNavigate: _selectPage),
    1 => CatalogPage(
      api: api,
      store: widget.store,
      title: 'الأفلام',
      categoryId: 'catalog:movie:all',
      mediaKind: 'movie',
      unified: true,
    ),
    2 => CatalogPage(
      api: api,
      store: widget.store,
      title: 'المسلسلات',
      categoryId: 'catalog:tv:all',
      mediaKind: 'series',
      unified: true,
    ),
    3 => CatalogPage(
      api: api,
      store: widget.store,
      title: 'الأنمي',
      categoryId: 'catalog:anime:movie',
      mediaKind: 'anime',
      unified: true,
    ),
    4 => CatalogPage(
      api: api,
      store: widget.store,
      title: 'التركي',
      categoryId: 'catalog:turkish:tv',
      mediaKind: 'turkish',
      unified: true,
    ),
    5 => SearchPage(api: api, store: widget.store),
    6 => LivePage(api: api, store: widget.store, channels: widget.channels),
    7 => LibraryPage(api: api, store: widget.store),
    8 => SettingsPage(
      api: api,
      store: widget.store,
      pointer: widget.pointer,
      clearCache: _clearBrowsingCache,
      clearDownloads:
          widget.clearDownloads != null || StorageCleanup.downloadsSupported
          ? _clearDownloads
          : null,
    ),
    _ => throw RangeError.index(page, _pages),
  };
  void _selectPage(int value) {
    if (index == value) return;
    setState(() {
      _pages[value] ??= _createPage(value);
      index = value;
      _headerVisible = true;
    });
  }

  void _closeNavigation() {
    _scaffoldKey.currentState?.closeDrawer();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _menuFocus.canRequestFocus) _menuFocus.requestFocus();
    });
  }

  Widget _navigation({required bool drawer}) => Material(
    key: const Key('tatv-right-sidebar'),
    color: Theme.of(context).colorScheme.surface,
    child: SafeArea(
      child: SizedBox(
        width: 232,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Expanded(child: _BrandTitle()),
                  if (drawer)
                    IconButton(
                      tooltip: 'إغلاق القائمة',
                      onPressed: _closeNavigation,
                      icon: const Icon(Icons.close),
                    ),
                ],
              ),
            ),
            Expanded(
              child: FocusTraversalGroup(
                policy: OrderedTraversalPolicy(),
                child: ListView.builder(
                  scrollCacheExtent: const ScrollCacheExtent.pixels(2000),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  itemCount: NajdUi.pageIds.length + NajdUi.regions.length,
                  itemBuilder: (context, i) {
                    if (i >= NajdUi.pageIds.length) {
                      final region = NajdUi.regions[i - NajdUi.pageIds.length];
                      return ListTile(
                        key: ValueKey('region-${region.id}'),
                        focusNode: _navFocus[i],
                        minTileHeight: isTvTarget ? 64 : 48,
                        leading: Icon(region.icon),
                        title: Text(region.label),
                        onTap: () {
                          if (drawer) _closeNavigation();
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => Scaffold(
                                appBar: AppBar(title: Text(region.label)),
                                body: CatalogPage(
                                  api: api,
                                  store: widget.store,
                                  title: region.label,
                                  categoryId: region.category,
                                  mediaKind: region.kind,
                                  unified: true,
                                ),
                              ),
                            ),
                          );
                        },
                      );
                    }
                    return FocusTraversalOrder(
                      order: NumericFocusOrder(i.toDouble()),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Focus(
                          canRequestFocus: false,
                          onKeyEvent: (node, event) {
                            if (event is! KeyDownEvent) {
                              return KeyEventResult.ignored;
                            }
                            if (event.logicalKey ==
                                    LogicalKeyboardKey.arrowDown ||
                                event.logicalKey ==
                                    LogicalKeyboardKey.arrowUp) {
                              final next =
                                  (i +
                                      (event.logicalKey ==
                                              LogicalKeyboardKey.arrowDown
                                          ? 1
                                          : -1)) %
                                  _navFocus.length;
                              _navFocus[next].requestFocus();
                              return KeyEventResult.handled;
                            }
                            if (event.logicalKey == LogicalKeyboardKey.select) {
                              _selectPage(i);
                              if (drawer) _closeNavigation();
                              return KeyEventResult.handled;
                            }
                            return KeyEventResult.ignored;
                          },
                          child: FocusHighlight(
                            child: TextButton(
                              key: ValueKey('nav-${NajdUi.pageIds[i]}'),
                              focusNode: _navFocus[i],
                              autofocus: !drawer && i == index,
                              style: TextButton.styleFrom(
                                alignment: Alignment.centerRight,
                                minimumSize: Size.fromHeight(
                                  isTvTarget ? 64 : 50,
                                ),
                                foregroundColor: i == index
                                    ? Theme.of(context).colorScheme.primary
                                    : Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant,
                                backgroundColor: i == index
                                    ? _brandAccent.withAlpha(26)
                                    : Colors.transparent,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                              ),
                              onPressed: () {
                                _selectPage(i);
                                if (drawer) _closeNavigation();
                              },
                              child: Row(
                                children: [
                                  Icon(NajdUi.icons[i]),
                                  const SizedBox(width: 12),
                                  Expanded(child: Text(NajdUi.labels[i])),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _header() => Material(
    color: Theme.of(context).scaffoldBackgroundColor,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Column(
        children: [
          Row(
            children: [
              if (isTvTarget ||
                  MediaQuery.sizeOf(context).width < NajdUi.sidebarBreakpoint)
                IconButton(
                  key: const Key('tatv-open-navigation'),
                  focusNode: _menuFocus,
                  tooltip: 'القائمة',
                  onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                  icon: const Icon(Icons.menu),
                ),
              const Expanded(child: _BrandTitle()),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final filter in [(1, 'فيلم'), (0, 'الكل'), (2, 'مسلسل')])
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  child: ChoiceChip(
                    label: Text(filter.$2),
                    selected: index == filter.$1,
                    onSelected: (_) => _selectPage(filter.$1),
                  ),
                ),
            ],
          ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: AdaptiveViewport(
      builder: (context, viewport) {
        final content = IndexedStack(
          index: index,
          children: List.generate(_pages.length, (page) {
            final child = _pages[page];
            return child == null
                ? const SizedBox.shrink()
                : KeyedSubtree(
                    key: ValueKey((page, page == 8 ? 0 : _pageGeneration)),
                    child: child,
                  );
          }),
        );
        final side =
            !isTvTarget &&
            (viewport.size.width >= NajdUi.sidebarBreakpoint ||
                isDesktopTarget);
        final browsing = NotificationListener<ScrollUpdateNotification>(
          onNotification: (notification) {
            if (notification.metrics.axis == Axis.vertical &&
                (notification.scrollDelta?.abs() ?? 0) > 3) {
              final visible =
                  notification.scrollDelta! < 0 ||
                  notification.metrics.pixels <= 0;
              if (visible != _headerVisible) {
                setState(() => _headerVisible = visible);
              }
            }
            return false;
          },
          child: Column(
            children: [
              AnimatedSize(
                duration: const Duration(milliseconds: 180),
                child: _headerVisible ? _header() : const SizedBox.shrink(),
              ),
              Expanded(child: content),
            ],
          ),
        );
        return Shortcuts(
          shortcuts: const {
            SingleActivator(LogicalKeyboardKey.escape): DismissIntent(),
          },
          child: Actions(
            actions: <Type, Action<Intent>>{
              DismissIntent: CallbackAction<DismissIntent>(
                onInvoke: (_) {
                  if (_scaffoldKey.currentState?.isDrawerOpen ?? false) {
                    _closeNavigation();
                  }
                  return null;
                },
              ),
            },
            child: Scaffold(
              key: _scaffoldKey,
              // In RTL, the start drawer opens on the physical right.
              drawer: side
                  ? null
                  : Drawer(
                      width: isTvTarget ? 340 : 272,
                      child: _navigation(drawer: true),
                    ),
              onDrawerChanged: (open) {
                setState(() => _drawerOpen = open);
                if (open) {
                  _navFocus[index].requestFocus();
                } else if (!side) {
                  _menuFocus.requestFocus();
                }
              },
              floatingActionButtonLocation:
                  FloatingActionButtonLocation.startFloat,
              floatingActionButton: !side && !_headerVisible
                  ? FloatingActionButton.small(
                      key: const Key('tatv-open-navigation'),
                      focusNode: _menuFocus,
                      tooltip: 'القائمة',
                      onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                      child: const Icon(Icons.menu),
                    )
                  : null,
              drawerScrimColor: Colors.black.withAlpha(160),
              bottomNavigationBar: NavigationBar(
                key: const Key('najd-bottom-navigation'),
                selectedIndex: !NajdUi.bottomPages.contains(index)
                    ? 2
                    : NajdUi.bottomPages.indexOf(index),
                onDestinationSelected: (value) =>
                    _selectPage(NajdUi.bottomPages[value]),
                destinations: [
                  for (final page in NajdUi.bottomPages)
                    NavigationDestination(
                      icon: Icon(NajdUi.icons[page]),
                      selectedIcon: Icon(
                        page == 0 ? Icons.home_rounded : NajdUi.icons[page],
                      ),
                      label: page == 5 ? 'بحث' : NajdUi.labels[page],
                    ),
                ],
              ),
              body: SafeArea(
                child: Stack(
                  children: [
                    if (side)
                      Row(
                        textDirection: TextDirection.rtl,
                        children: [
                          _navigation(drawer: false),
                          const VerticalDivider(width: 1),
                          Expanded(child: browsing),
                        ],
                      )
                    else
                      browsing,
                    if (isTvTarget && _drawerOpen)
                      Positioned.fill(
                        child: IgnorePointer(
                          child: BackdropFilter(
                            filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
                            child: const ColoredBox(color: Colors.transparent),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    ),
  );
}

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    required this.api,
    required this.store,
    this.onNavigate,
  });
  final ValueChanged<int>? onNavigate;
  final MitvApi api;
  final LocalLibraryStore store;
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late final Future<List<CatalogItem>> _latest = widget.api.category(
    'catalog:movie:all',
  );
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.store,
    builder: (context, _) => ListView(
      padding: const EdgeInsets.all(16),
      children: [
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
                    height: (bounds.maxWidth * .45).clamp(220, 400),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (item.poster.isNotEmpty)
                          Image.network(
                            item.poster,
                            fit: BoxFit.cover,
                            cacheWidth: 1000,
                            errorBuilder: (_, _, _) => const SizedBox.shrink(),
                          ),
                        const DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Colors.black26, Color(0xF007090B)],
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'أحدث الإضافات',
                                style: TextStyle(color: Colors.white),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                item.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.headlineSmall
                                    ?.copyWith(color: Colors.white),
                              ),
                              const SizedBox(height: 12),
                              FilledButton.icon(
                                onPressed: () => openDetails(
                                  context,
                                  widget.api,
                                  widget.store,
                                  item,
                                ),
                                icon: const Icon(Icons.play_arrow),
                                label: const Text('التفاصيل والتشغيل'),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            FilledButton.tonalIcon(
              onPressed: () => widget.onNavigate?.call(7),
              icon: const Icon(Icons.bookmark_outline),
              label: const Text('مكتبتي والتنزيلات'),
            ),
            FilledButton.tonalIcon(
              onPressed: () => widget.onNavigate?.call(5),
              icon: const Icon(Icons.search),
              label: const Text('البحث'),
            ),
          ],
        ),
        FutureBuilder<List<CatalogItem>>(
          future: _latest,
          builder: (context, snapshot) {
            final items = snapshot.data ?? const <CatalogItem>[];
            if (items.isEmpty) return const SizedBox.shrink();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(child: Text('أحدث الأفلام')),
                    TextButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => Scaffold(
                            appBar: AppBar(title: const Text('أحدث الأفلام')),
                            body: CatalogPage(
                              api: widget.api,
                              store: widget.store,
                              title: 'أحدث الأفلام',
                              categoryId: 'catalog:movie:all',
                              unified: true,
                            ),
                          ),
                        ),
                      ),
                      child: const Text('عرض المزيد'),
                    ),
                  ],
                ),
                SizedBox(
                  height: 270,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) => SizedBox(
                      width: 155,
                      child: _CatalogCard(
                        item: items[index],
                        onTap: () => openDetails(
                          context,
                          widget.api,
                          widget.store,
                          items[index],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 24),
        Text('أكمل المشاهدة', style: Theme.of(context).textTheme.titleLarge),
        if (widget.store.continueWatching.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('ستظهر الأعمال التي تتابعها هنا'),
          ),
        for (final entry in widget.store.continueWatching)
          FocusHighlight(
            child: ListTile(
              title: Text(
                entry.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: LinearProgressIndicator(
                value: entry.durationMs > 0 ? entry.progress : null,
              ),
              leading: const Icon(Icons.play_circle_outline),
              onTap: () => openDetails(
                context,
                widget.api,
                widget.store,
                entry.catalogItem,
              ),
            ),
          ),
      ],
    ),
  );
}

class LivePage extends StatelessWidget {
  const LivePage({
    super.key,
    required this.api,
    required this.store,
    this.channels = const [],
  });
  final MitvApi api;
  final LocalLibraryStore store;
  final List<ConfiguredTvChannel> channels;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Expanded(
        child: MatchesPage(api: api, store: store),
      ),
      Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          'القنوات المباشرة',
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ),
      if (channels.isEmpty)
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Text('لا توجد قنوات مباشرة مهيأة حاليًا'),
        ),
      if (channels.isNotEmpty)
        Expanded(
          child: ListView(
            children: [
              for (final package in channels.map((c) => c.package).toSet()) ...[
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(package),
                ),
                for (final channel in channels.where(
                  (c) => c.package == package,
                ))
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
                              ref: channel.sourceRef,
                            ),
                            title: channel.title,
                            sourceRef: channel.sourceRef,
                            isLive: true,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
    ],
  );
}

class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.api,
    required this.store,
    this.pointer,
    this.clearCache,
    this.clearDownloads,
  });
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
  bool _confirming = false;
  Future<void> _clear(String title, Future<void> Function() action) async {
    if (_busy || _confirming) return;
    _confirming = true;
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text(title),
          content: const Text('تأكيد حذف البيانات المحددة من هذا الجهاز؟'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('حذف'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      setState(() => _busy = true);
      await action();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('تعذر إكمال التنظيف')));
      }
    } finally {
      _confirming = false;
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const ListTile(
        title: Text(NajdUi.brand),
        subtitle: Text('نجد · خزامى في المظهر الفاتح والداكن'),
      ),
      FocusHighlight(
        child: ListTile(
          title: const Text('مكتبتي والتنزيلات'),
          leading: const Icon(Icons.video_library_outlined),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => Scaffold(
                appBar: AppBar(title: const Text('المفضلة والتنزيلات')),
                body: LibraryPage(api: widget.api, store: widget.store),
              ),
            ),
          ),
        ),
      ),
      ListTile(
        leading: const Icon(Icons.person_outline),
        title: const Text('الحساب والربط'),
        onTap: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const NajdAccountPage())),
      ),
      ListTile(
        leading: const Icon(Icons.aspect_ratio),
        title: const Text('قياسات الشاشة الحالية'),
        subtitle: Text(
          '${MediaQuery.sizeOf(context).width.round()} × ${MediaQuery.sizeOf(context).height.round()} · كثافة ${MediaQuery.devicePixelRatioOf(context).toStringAsFixed(2)}\nحدود آمنة: ${MediaQuery.viewPaddingOf(context)}',
        ),
      ),
      const NajdThemeControl(),
      const NajdFontAddonControl(),
      if (isTvTarget && widget.pointer != null)
        AnimatedBuilder(
          animation: widget.pointer!,
          builder: (context, _) => SwitchListTile(
            title: const Text('الفأرة الافتراضية'),
            subtitle: const Text(
              'زر القائمة أو F8 للتبديل؛ الأسهم للحركة وOK للاختيار',
            ),
            value: widget.pointer!.enabled,
            onChanged: widget.pointer!.setEnabled,
          ),
        ),
      const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Text('التخزين والسجل'),
      ),
      if (widget.clearCache != null)
        ListTile(
          title: const Text('مسح الكاش المحلي'),
          leading: const Icon(Icons.cleaning_services_outlined),
          enabled: !_busy,
          onTap: () => _clear('مسح الكاش المحلي', widget.clearCache!),
        ),
      if (!kIsWeb && widget.clearDownloads != null)
        ListTile(
          title: const Text('حذف الملفات المحمّلة'),
          leading: const Icon(Icons.delete_outline),
          enabled: !_busy,
          onTap: () => _clear('حذف الملفات المحمّلة', widget.clearDownloads!),
        ),
      ListTile(
        title: const Text('مسح سجل المشاهدة'),
        enabled: !_busy,
        leading: const Icon(Icons.history),
        onTap: () => _clear('مسح سجل المشاهدة', widget.store.clearHistory),
      ),
      ListTile(
        title: const Text('مسح سجل البحث'),
        enabled: !_busy,
        leading: const Icon(Icons.search_off),
        onTap: () => _clear('مسح سجل البحث', widget.store.clearSearchHistory),
      ),
      const AboutListTile(
        applicationName: NajdUi.brand,
        applicationVersion: '1.1.5',
        child: Text('عن نجد والتراخيص'),
      ),
      if (_busy) const LinearProgressIndicator(),
    ],
  );
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
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, bounds) {
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
              color: const Color(0xFF1A1A18),
              border: Border.all(color: const Color(0x448480FF)),
            ),
            child: logo.isEmpty
                ? const Icon(Icons.shield_outlined, color: _brandAccentMuted)
                : Image.network(
                    logo,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) => const Icon(
                      Icons.shield_outlined,
                      color: _brandAccentMuted,
                    ),
                  ),
          ),
          const SizedBox(height: 7),
          Text(
            name,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      );
    },
  );
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
      (_carousel.offset + direction * _carousel.position.viewportDimension * .8)
          .clamp(0, _carousel.position.maxScrollExtent),
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('المباراة انتهت ولا يوجد بث مباشر الآن.')),
      );
      return;
    }
    if (match.ref.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('مرجع تشغيل المباراة غير متاح حاليًا.')),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            MatchPlayerPage(api: widget.api, match: match, store: widget.store),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(
        children: [
          const Expanded(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('مباريات اليوم'),
            ),
          ),
          if (MediaQuery.sizeOf(context).width >= 700) ...[
            IconButton(
              tooltip: 'المباريات السابقة',
              onPressed: () => _scrollMatches(-1),
              icon: const Icon(Icons.chevron_right),
            ),
            IconButton(
              tooltip: 'المباريات التالية',
              onPressed: () => _scrollMatches(1),
              icon: const Icon(Icons.chevron_left),
            ),
          ],
          IconButton(
            key: const Key('matches-refresh'),
            tooltip: 'تحديث المباريات',
            onPressed: _reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
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
                          width:
                              (bounds.maxWidth /
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
                                  vertical: isTvTarget ? 22 : 16,
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: _TeamBadge(
                                        name: m.home,
                                        logo: m.homeLogo,
                                      ),
                                    ),
                                    SizedBox(
                                      width: isTvTarget ? 180 : 110,
                                      child: Column(
                                        children: [
                                          Text(
                                            status,
                                            style: TextStyle(
                                              color: m.status == 'live'
                                                  ? Colors.redAccent
                                                  : Theme.of(context)
                                                        .colorScheme
                                                        .onSurfaceVariant,
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            center,
                                            style: TextStyle(
                                              fontSize: isTvTarget ? 28 : 20,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          if (m.competition.isNotEmpty) ...[
                                            const SizedBox(height: 6),
                                            Text(
                                              m.competition,
                                              textAlign: TextAlign.center,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
                                                color: Theme.of(context)
                                                    .colorScheme
                                                    .onSurfaceVariant,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                    Expanded(
                                      child: _TeamBadge(
                                        name: m.away,
                                        logo: m.awayLogo,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            );
          },
        ),
      ),
    ],
  );
}

class CatalogPage extends StatefulWidget {
  const CatalogPage({
    super.key,
    required this.api,
    required this.store,
    required this.title,
    required this.categoryId,
    this.unified = false,
    this.mediaKind,
  });
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
    'laroza-series': 'لاروزا — مسلسلات',
    'alooy-series': 'Alooy TV',
    'series-foreign': 'أكوام — أجنبية',
    'series-arabic': 'أكوام — عربية',
    'series-turkish': 'أكوام — تركية',
  };
  static const iskCategories = <String, String>{
    '3isk-latest': 'قصة عشق (أحدث الحلقات)',
    '3isk-turkish': 'جميع المسلسلات (مترجم ومدبلج)',
    '3isk-dubbed': 'مسلسلات مدبلجة (مدبلج فقط)',
    '3isk-movies': 'جميع الأفلام',
  };
  Map<String, String> get _legacyCategories {
    switch (widget.mediaKind) {
      case 'movie':
        return {
          'movie-foreign': 'أكوام — أفلام أجنبية',
          'movie-arabic': 'أكوام — أفلام عربية',
          'laroza-movies': 'لاروزا — أفلام',
          '3isk-movies': 'قصة عشق — أفلام',
        };
      case 'series':
        return {
          ...seriesCategories,
          for (final entry in iskCategories.entries)
            if (entry.key != '3isk-movies') entry.key: entry.value,
        };
      case 'anime':
        return {
          'movie-anime': 'أكوام — أفلام أنمي',
          'series-anime': 'أكوام — مسلسلات أنمي',
          'laroza-anime': 'لاروزا — أنمي',
        };
      default:
        return widget.unified
            ? {
                'movie-foreign': 'أكوام — أفلام أجنبية',
                'movie-arabic': 'أكوام — أفلام عربية',
                ...seriesCategories,
                ...iskCategories,
              }
            : widget.categoryId.startsWith('3isk-')
            ? iskCategories
            : seriesCategories;
    }
  }

  Map<String, String> get _categories {
    if (!widget.categoryId.startsWith('catalog:')) {
      return _legacyCategories;
    }
    return switch (widget.mediaKind) {
      'movie' => {
        'catalog:movie:all': 'الكل',
        'catalog:movie:en': 'أجنبي',
        'catalog:movie:ar': 'عربي',
        'catalog:movie:hi': 'هندي',
        'catalog:movie:ko': 'آسيوي',
        'catalog:movie:tr': 'تركي',
      },
      'series' => {
        'catalog:tv:all': 'الكل',
        'catalog:tv:en': 'أجنبي',
        'catalog:tv:ar': 'عربي',
        'catalog:tv:tr': 'تركي',
        'catalog:tv:ko': 'آسيوي',
      },
      'anime' => {
        'catalog:anime:movie': 'أفلام أنمي',
        'catalog:anime:tv': 'مسلسلات أنمي',
      },
      'turkish' => {
        'catalog:turkish:tv': 'مسلسلات تركية',
        'catalog:turkish:movie': 'أفلام تركية',
      },
      _ => {widget.categoryId: widget.title},
    };
  }

  bool _matchesKind(CatalogItem item) {
    return selectedCategory.startsWith('catalog:') ||
        widget.mediaKind == null ||
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
      textScaler: MediaQuery.textScalerOf(context),
    ).columns(minimumCardWidth: isTvTarget ? 200 : 160);
    final width = MediaQuery.sizeOf(context).width / columns;
    final rowHeight = width / (isTvTarget ? .68 : .62) + 18;
    final start = ((controller.offset / rowHeight).floor() * columns).clamp(
      0,
      items.length,
    );
    for (final item in items.skip(start).take(columns * 2)) {
      if (!_prefetched.add(item.ref)) continue;
      if (item.poster.isNotEmpty) {
        unawaited(
          precacheImage(
            ResizeImage(NetworkImage(item.poster), width: 320),
            context,
            onError: (_, _) {},
          ),
        );
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
  Widget build(BuildContext context) => Column(
    children: [
      if (widget.unified ||
          widget.categoryId.startsWith('series-') ||
          widget.categoryId.startsWith('3isk-'))
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: DropdownButton<String>(
            isExpanded: true,
            value: selectedCategory,
            items: _categories.entries
                .map(
                  (entry) => DropdownMenuItem(
                    value: entry.key,
                    child: Text(entry.value),
                  ),
                )
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
              mainAxisSpacing: isTvTarget ? 18 : 10,
            ),
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
                          label: const Text('إعادة المحاولة'),
                        )
                      : done
                      ? const Text('تم عرض كل الأعمال المتاحة')
                      : TextButton.icon(
                          onPressed: _loadMore,
                          icon: const Icon(Icons.expand_more),
                          label: const Text('عرض الصفحة التالية'),
                        ),
                );
              }
              final item = items[i];
              return _CatalogCard(
                item: item,
                onTap: () =>
                    openDetails(context, widget.api, widget.store, item),
              );
            },
          ),
        ),
      ),
    ],
  );
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: item.poster.isEmpty
                  ? const ColoredBox(
                      color: Color(0xFF171817),
                      child: Center(
                        child: Icon(
                          Icons.movie_outlined,
                          color: _brandAccentMuted,
                          size: 42,
                        ),
                      ),
                    )
                  : Image.network(
                      item.poster,
                      cacheWidth: 320,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const ColoredBox(
                        color: Color(0xFF171817),
                        child: Center(
                          child: Icon(
                            Icons.broken_image_outlined,
                            color: _brandAccentMuted,
                            size: 38,
                          ),
                        ),
                      ),
                    ),
            ),
            Padding(
              padding: EdgeInsets.all(isTvTarget ? 12 : 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
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
                      if (item.year != null) '${item.year}',
                    ].join(' • '),
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
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
  bool loadingMore = false;
  bool hasMore = false;
  int page = 1;
  final resultsController = ScrollController();
  @override
  void initState() {
    super.initState();
    resultsController.addListener(() {
      if (resultsController.hasClients &&
          resultsController.position.extentAfter < 700) {
        unawaited(loadMore());
      }
    });
  }

  Future<void> loadMore() async {
    if (advanced || loading || loadingMore || !hasMore) return;
    final request = generation, q = query.text.trim();
    final nextPage = page + 1;
    setState(() => loadingMore = true);
    try {
      final next = await widget.api.searchTmdbPage(q, page: nextPage);
      if (!mounted || request != generation) return;
      setState(() {
        items = UnifiedMedia.mergeSources([...items, ...next]);
        page = nextPage;
        hasMore = widget.api.searchHasMore(q, page) ?? next.length >= 20;
      });
    } catch (_) {
      if (mounted && request == generation) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تعذر تحميل الصفحة التالية؛ حاول مجددًا'),
          ),
        );
      }
    } finally {
      if (mounted && request == generation) setState(() => loadingMore = false);
    }
  }

  bool submitted = false;
  String? error;
  bool advanced = false;
  List<String> sources = const [];
  String? selectedSource;
  String? sourceError;
  bool loadingSources = false;

  Future<void> _setAdvanced(bool value) async {
    debounce?.cancel();
    generation += 1;
    setState(() {
      advanced = value;
      items = const [];
      submitted = false;
      loading = false;
      error = null;
    });
    if (!value || sources.isNotEmpty || loadingSources) return;
    setState(() {
      loadingSources = true;
      sourceError = null;
    });
    try {
      final available = await widget.api.explorationSources();
      if (!mounted) return;
      setState(() {
        sources = available;
        loadingSources = false;
        sourceError = available.isEmpty
            ? 'لا توجد مصادر بحث متاحة حاليًا'
            : null;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          loadingSources = false;
          sourceError = 'تعذر تحميل المصادر. أعد المحاولة.';
        });
      }
    }
  }

  String _sourceLabel(String id) => widget.api.explorationSourceLabel(id);

  Timer? debounce;
  int generation = 0;

  @override
  void dispose() {
    generation += 1;
    debounce?.cancel();
    query.dispose();
    resultsController.dispose();
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
    if (q.length < 2 || q.length > 120) return;
    if (advanced && selectedSource == null) {
      setState(() {
        error = 'حدد المصدر أولًا للبحث المتقدم';
        submitted = true;
      });
      return;
    }
    final request = ++generation;
    setState(() {
      loading = true;
      loadingMore = false;
      hasMore = false;
      page = 1;
      submitted = true;
      error = null;
    });
    try {
      final result = advanced
          ? await widget.api.explore(q, selectedSource!)
          : await widget.api.searchTmdb(q);
      if (!mounted || request != generation || q != query.text.trim()) return;
      setState(() {
        items = result;
        hasMore =
            !advanced &&
            (widget.api.searchHasMore(q, 1) ?? result.length >= 20);
        loading = false;
      });
    } catch (_) {
      if (!mounted || request != generation) return;
      setState(() {
        items = const [];
        loading = false;
        error =
            '${widget.api.lastSearchStage == 'client_no_response' ? 'لم يصل رد للتطبيق؛ قد يكون انقطاع اتصال أو مهلة.' : 'تعذر البحث حاليًا. أعد المحاولة.'}'
            '${widget.api.lastSearchTrace != null ? ' رقم التشخيص: ${widget.api.lastSearchTrace}' : ''}';
      });
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.all(isTvTarget ? 24 : 12),
    child: Column(
      children: [
        TextField(
          controller: query,
          textInputAction: TextInputAction.search,
          onChanged: onQueryChanged,
          onSubmitted: (_) => run(),
          decoration: InputDecoration(
            hintText: 'ابحث عن فيلم أو مسلسل',
            suffixIcon: IconButton(
              key: const Key('search-submit'),
              onPressed: loading ? null : () => run(),
              icon: const Icon(Icons.search),
            ),
          ),
        ),
        const SizedBox(height: 10),
        SwitchListTile.adaptive(
          key: const Key('search-advanced-toggle'),
          contentPadding: EdgeInsets.zero,
          title: const Text('بحث متقدم — استكشاف'),
          subtitle: const Text('البحث من مصدر تختاره'),
          value: advanced,
          onChanged: _setAdvanced,
        ),
        if (advanced) ...[
          if (loadingSources) const LinearProgressIndicator(),
          if (sourceError != null)
            Row(
              children: [
                Expanded(child: Text(sourceError!)),
                TextButton(
                  onPressed: () => _setAdvanced(true),
                  child: const Text('إعادة المحاولة'),
                ),
              ],
            ),
          if (sources.isNotEmpty)
            DropdownButtonFormField<String>(
              key: const Key('search-explore-source'),
              initialValue: selectedSource,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'المصدر'),
              items: sources
                  .map(
                    (source) => DropdownMenuItem(
                      value: source,
                      child: Text(
                        _sourceLabel(source),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                debounce?.cancel();
                generation += 1;
                setState(() {
                  selectedSource = value;
                  items = const [];
                  submitted = false;
                  loading = false;
                  error = null;
                });
              },
            ),
        ],
        if (loading) const LinearProgressIndicator(),
        const SizedBox(height: 10),
        Expanded(
          child: error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton.tonal(
                        onPressed: () => run(),
                        child: const Text('إعادة المحاولة'),
                      ),
                    ],
                  ),
                )
              : submitted && !loading && items.isEmpty
              ? Center(
                  child: Text(
                    advanced
                        ? 'لم يستخرج القاشط نتائج؛ لا يؤكد ذلك غياب العمل من الموقع.\nرقم التشخيص: ${widget.api.lastSearchTrace ?? 'غير متاح'}'
                        : 'لا توجد نتائج لهذا البحث حاليًا',
                  ),
                )
              : !submitted
              ? const Center(child: Text('اكتب اسم فيلم أو مسلسل للبحث'))
              : GridView.builder(
                  controller: resultsController,
                  gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: isTvTarget ? 260 : 220,
                    childAspectRatio: isTvTarget ? .68 : .62,
                    crossAxisSpacing: isTvTarget ? 18 : 10,
                    mainAxisSpacing: isTvTarget ? 18 : 10,
                  ),
                  itemCount: items.length + (hasMore ? 1 : 0),
                  itemBuilder: (context, i) => i == items.length
                      ? Center(
                          child: loadingMore
                              ? const CircularProgressIndicator()
                              : TextButton(
                                  onPressed: loadMore,
                                  child: const Text('عرض المزيد'),
                                ),
                        )
                      : _CatalogCard(
                          item: items[i],
                          onTap: () => openDetails(
                            context,
                            widget.api,
                            widget.store,
                            items[i],
                          ),
                        ),
                ),
        ),
      ],
    ),
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
          ...favorites.map(
            (item) => ListTile(
              leading: const Icon(Icons.favorite),
              trailing: item.ref.startsWith('tmdb:')
                  ? FavoriteRefresh(ref: item.ref)
                  : null,
              title: Text(item.title),
              onTap: () => openDetails(context, api, store, item),
            ),
          ),
          const SizedBox(height: 18),
          Text('أكمل المشاهدة', style: Theme.of(context).textTheme.titleLarge),
          if (watching.isEmpty)
            const ListTile(title: Text('لا توجد مشاهدة غير مكتملة')),
          ...watching.map(
            (entry) => ListTile(
              leading: const Icon(Icons.play_circle_outline),
              title: Text(entry.title),
              subtitle: LinearProgressIndicator(
                value: entry.durationMs > 0 ? entry.progress : null,
              ),
              onTap: () => openDetails(context, api, store, entry.catalogItem),
            ),
          ),
          const SizedBox(height: 18),
          const DownloadLibrarySection(),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: Text(
                  'السجل',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (history.isNotEmpty)
                TextButton(
                  onPressed: store.clearHistory,
                  child: const Text('مسح السجل'),
                ),
            ],
          ),
          if (history.isEmpty) const ListTile(title: Text('سجل المشاهدة فارغ')),
          ...history.map(
            (entry) => ListTile(
              leading: const Icon(Icons.history),
              title: Text(entry.title),
              subtitle: Text(
                entry.episodeNumber == null
                    ? 'آخر مشاهدة'
                    : 'الحلقة ${entry.episodeNumber}',
              ),
              onTap: () => openDetails(context, api, store, entry.catalogItem),
            ),
          ),
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
      child: Text(message, textAlign: TextAlign.center),
    ),
  );
}
