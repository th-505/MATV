import 'source_selection_memory.dart';
import 'app_preferences.dart';
import 'search_work_groups.dart';
import 'najd_panels.dart';
import 'stitch_design.dart';

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_target.dart';
import 'download_service.dart';
import 'library_store.dart';
import 'models.dart';
import 'player_page.dart';
import 'route_focus_restorer.dart';
import 'source_editions_panel.dart';

String buildDownloadResumeKey(CatalogItem item, String key) {
  final catalogId = item.id.trim();
  final stableItem = catalogId.isNotEmpty
      ? catalogId
      : '${item.type.trim()}:${item.title.trim()}:${item.year ?? ''}';
  return '$stableItem:$key';
}

class DetailsPage extends StatefulWidget {
  const DetailsPage({
    super.key,
    required this.api,
    required this.store,
    required this.item,
    this.downloads,
    this.onPlaySelection,
    this.providerCatalogRef = '',
    this.searchMatches = const [],
  });

  final List<CatalogItem> searchMatches;
  final MitvApi api;
  final LocalLibraryStore store;
  final CatalogItem item;
  final String providerCatalogRef;
  final DownloadService? downloads;
  final Future<void> Function(CatalogItem, TitleDetails, EpisodeItem?)?
  onPlaySelection;

  @override
  State<DetailsPage> createState() => _DetailsPageState();
}

class _DetailsPageState extends State<DetailsPage> {
  late Future<TitleDetails> future;
  bool _cardHarvestError = false;
  String? _metadataLanguage;
  String _primaryDownloadKey = 'direct';
  int selectedSeason = 1;
  TitleDetails? _seasonDetails;
  bool _seasonBusy = false;
  String? _seasonError;
  int _seasonGeneration = 0;
  Future<void> _changeSeason(TitleDetails original, int value) async {
    final generation = ++_seasonGeneration;
    setState(() {
      selectedSeason = value;
      _seasonBusy = true;
      _seasonError = null;
    });
    try {
      final base = original.sourceWorkRef.isNotEmpty
          ? original.sourceWorkRef
          : widget.item.ref;
      final details = await widget.api.details('$base:s$value:e1');
      if (!mounted || generation != _seasonGeneration) return;
      setState(() {
        _seasonDetails = details;
        _seasonBusy = false;
      });
    } catch (_) {
      if (mounted && generation == _seasonGeneration) {
        setState(() {
          _seasonBusy = false;
          _seasonError = 'تعذر تحميل حلقات الموسم. أعد المحاولة.';
        });
      }
    }
  }

  late final DownloadService _downloads;
  late final bool _ownsDownloads;
  final Set<String> _activeDownloads = <String>{};
  final Map<String, DownloadCancellationToken> _downloadTokens =
      <String, DownloadCancellationToken>{};
  final Map<String, DownloadProgress> _downloadProgress =
      <String, DownloadProgress>{};
  final Map<String, int> _reportedBytes = <String, int>{};
  final FocusNode _directPlayFocus = FocusNode(
    debugLabel: 'details-direct-play',
  );
  final Map<String, FocusNode> _episodeFocusNodes = <String, FocusNode>{};
  final Map<String, FocusNode> _episodeDownloadFocusNodes =
      <String, FocusNode>{};

  @override
  void initState() {
    super.initState();
    selectedSeason = widget.item.season ?? 1;
    _downloads = widget.downloads ?? DownloadService();
    _ownsDownloads = widget.downloads == null;
    widget.api.rememberIdentity(widget.item);
    if (widget.api.canRequestHarvest(widget.item.ref)) unawaited(_queueCard());
    future = _loadDetails(widget.item.ref);
  }

  @override
  void dispose() {
    for (final token in _downloadTokens.values) {
      token.cancel();
    }
    _directPlayFocus.dispose();
    for (final node in _episodeFocusNodes.values) {
      node.dispose();
    }
    for (final node in _episodeDownloadFocusNodes.values) {
      node.dispose();
    }
    if (_ownsDownloads) _downloads.close();
    super.dispose();
  }

  Future<void> _queueCard({bool retry = false}) async {
    try {
      await widget.api.requestHarvest(
        widget.item.ref,
        reason: retry ? 'retry' : 'card_open',
      );
      if (mounted && _cardHarvestError) {
        setState(() => _cardHarvestError = false);
      }
    } catch (_) {
      if (mounted) setState(() => _cardHarvestError = true);
    }
  }

  Future<TitleDetails> _loadDetails(String ref) async {
    var details = await widget.api.details(ref);
    if (details.poster.isEmpty && widget.item.poster.isNotEmpty) {
      details = details.copyWith(poster: widget.item.poster);
    }
    if (ref.startsWith('tmdb:')) {
      try {
        final localized = await widget.api.localizedMetadata(
          ref,
          _metadataLanguage ?? NajdPreferences.instance.metadataLanguage,
        );
        details = details.copyWith(
          title: localized.title,
          plot: localized.plot,
          genres: localized.genres,
          cast: localized.cast,
          directors: localized.directors,
          directorPeople: localized.directorPeople,
        );
      } catch (_) {
        // Keep usable cached metadata when translation is temporarily unavailable.
      }
    }
    if (mounted &&
        details.sourceWorkRef.isNotEmpty &&
        details.availableSeasons.isNotEmpty &&
        _seasonDetails == null &&
        !_seasonBusy) {
      selectedSeason =
          details.season ??
          (details.availableSeasons.contains(selectedSeason)
              ? selectedSeason
              : details.availableSeasons.first);
    }
    return details;
  }

  void retry() => setState(() => future = _loadDetails(widget.item.ref));

  Future<void> _toggleFavorite() async {
    await widget.store.toggleFavorite(widget.item);
    if (!mounted) return;
    if (!widget.store.isFavorite(widget.item.ref)) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('أضيف إلى قائمتك')));
    try {
      await widget.api.requestHarvest(widget.item.ref, reason: 'favorite');
    } catch (_) {
      if (mounted) setState(() => _cardHarvestError = true);
    }
  }

  Future<void> _openSourceEdition(Map<String, dynamic> edition) async {
    final ref = '${edition['ref'] ?? ''}';
    if (!RegExp(r'^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$')
        .hasMatch(ref)) {
      return;
    }
    final item = CatalogItem(
      id: ref,
      ref: ref,
      title: '${edition['title'] ?? widget.item.title}',
      poster: widget.item.poster,
      type: widget.item.type,
      source: '${edition['provider'] ?? ''}',
    );
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => DetailsPage(
          api: widget.api,
          store: widget.store,
          item: item,
          onPlaySelection: widget.onPlaySelection,
          searchMatches: widget.searchMatches,
        ),
      ),
    );
  }

  Future<void> _showProviders() => showNajdPanel<void>(
    context,
    title: 'المصادر والمزودون',
    icon: Icons.dns_outlined,
    description:
        'اختر المزود لعرض الاسم والملخص والمواسم والحلقات كما وردت في موقعه.',
    body: (panelContext) => widget.searchMatches.length > 1
        ? Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final item in SearchWorkGroup(
                '',
                widget.searchMatches,
              ).providerChoices)
                ExpansionTile(
                  leading: const Icon(Icons.video_library_outlined),
                  title: Text(widget.api.explorationSourceLabel(item.source)),
                  subtitle: Text(item.title),
                  children: [
                    for (final match in widget.searchMatches.where(
                      (entry) =>
                          entry.source == item.source &&
                          entry.edition == item.edition,
                    ))
                      ListTile(
                        title: Text(match.title),
                        trailing: const Icon(Icons.chevron_left),
                        onTap: () {
                          Navigator.pop(panelContext);
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => DetailsPage(
                                api: widget.api,
                                store: widget.store,
                                item: match,
                                searchMatches: widget.searchMatches,
                              ),
                            ),
                          );
                        },
                      ),
                  ],
                ),
            ],
          )
        : SourceEditionsPanel(
            api: widget.api,
            workRef: _providersRef,
            onOpen: (edition) {
              Navigator.pop(context);
              unawaited(_openSourceEdition(edition));
            },
          ),
  );

  Future<void> _watch(TitleDetails details) async {
    if (widget.onPlaySelection == null &&
        SourceSelectionMemory.canonical(widget.item.ref)) {
      final choice = await SourceSelectionMemory.read(widget.item.ref);
      if (!mounted) return;
      if (choice != null) {
        await Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => PlayerPage(
              api: widget.api,
              store: widget.store,
              item: CatalogItem(
                id: choice.workRef,
                ref: choice.workRef,
                title: choice.title.isEmpty ? details.title : choice.title,
                poster: details.poster,
                type: widget.item.type,
                source: choice.provider,
                season: choice.season,
                episode: choice.number,
              ),
              title: choice.title.isEmpty ? details.title : choice.title,
              sourceRef: choice.episodeRef,
              episodeId: choice.episodeId,
              episodeNumber: choice.number,
              providerCatalogRef: widget.item.ref,
              searchMatches: widget.searchMatches,
            ),
          ),
        );
        return;
      }
    }
    final episodes = details.episodes
        .where((e) => e.watchAvailable && e.ref.isNotEmpty)
        .toList();
    if (episodes.isNotEmpty) {
      final saved = widget.store.history
          .where((e) => e.contentRef == widget.item.ref)
          .firstOrNull;
      final episode =
          episodes.where((e) => e.id == saved?.episodeId).firstOrNull ??
          episodes.first;
      await _openEpisode(
        episode,
        _episodeFocus(episode),
        queue: details.episodes,
      );
    } else {
      await _openDirect(details);
    }
  }

  Future<void> _downloadPrimary(TitleDetails details) async {
    if (_activeDownloads.contains(_primaryDownloadKey)) {
      await _cancelDownload(_primaryDownloadKey);
      return;
    }
    if (SourceSelectionMemory.canonical(widget.item.ref)) {
      final choice = await SourceSelectionMemory.read(widget.item.ref);
      if (!mounted) return;
      if (choice != null) {
        final key = 'selected:${choice.episodeRef}';
        setState(() => _primaryDownloadKey = key);
        await _download(
          key: key,
          title: choice.number == null
              ? details.title
              : '${details.title} — الحلقة ${choice.number}',
          sourceRef: choice.episodeRef,
        );
        return;
      }
    }
    final episodes = details.episodes
        .where((e) => e.watchAvailable && e.ref.isNotEmpty)
        .toList();
    if (episodes.isNotEmpty) {
      final episode = await showNajdOptions<EpisodeItem>(
        context,
        title: 'تحميل حلقة',
        icon: Icons.download_outlined,
        options: [
          for (final ep in episodes)
            NajdOption(
              ep,
              ep.title.isEmpty ? 'الحلقة ${ep.number}' : ep.title,
              subtitle:
                  'الموسم ${ep.season ?? selectedSeason} • الحلقة ${ep.number}',
              icon: Icons.download_outlined,
            ),
        ],
      );
      if (episode == null || !mounted) return;
      setState(
        () => _primaryDownloadKey = 'episode:${episode.id}:${episode.number}',
      );
      await _download(
        key: _primaryDownloadKey,
        title: '${details.title} — الحلقة ${episode.number}',
        sourceRef: episode.ref,
      );
    } else {
      final target = _directContext;
      setState(
        () => _primaryDownloadKey = target.number == null
            ? 'direct'
            : 'episode:${target.ref}',
      );
      await _download(
        key: _primaryDownloadKey,
        title: target.number == null
            ? details.title
            : '${details.title} — الحلقة ${target.number}',
        sourceRef: target.ref,
      );
    }
  }

  String get _providersRef => widget.providerCatalogRef.isEmpty
      ? widget.item.ref
      : widget.providerCatalogRef;

  bool _refreshingSourceIndex = false;
  String? _sourceRefreshMessage;
  Future<void> _refreshSourceIndex(String ref) async {
    if (_refreshingSourceIndex) return;
    setState(() {
      _refreshingSourceIndex = true;
      _sourceRefreshMessage = 'جاري تحديث فهرس هذا المصدر فقط…';
    });
    try {
      final data = await widget.api.refreshSourceIndex(
        ref,
        season: selectedSeason,
      );
      if (!mounted) return;
      setState(() {
        future = Future.value(TitleDetails.fromJson(data));
        _sourceRefreshMessage = 'وصل تحديث الفهرس من المصدر المحدد.';
      });
    } catch (error) {
      if (mounted) {
        setState(
          () => _sourceRefreshMessage =
              error is ApiException &&
                  error.code == 'SOURCE_INDEX_STILL_PENDING'
              ? 'التحديث مستمر في الخلفية؛ الفهرس الحالي محفوظ. أعد التحقق بعد قليل.'
              : 'تعذر تأكيد التحديث حاليًا؛ الفهرس الحالي محفوظ.',
        );
      }
    } finally {
      if (mounted) setState(() => _refreshingSourceIndex = false);
    }
  }

  bool _loadingEpisodePage = false;
  Future<void> _moreEpisodes() async {
    if (_loadingEpisodePage) return;
    setState(() => _loadingEpisodePage = true);
    try {
      final current = await future;
      if (current.episodeNextOffset == null) return;
      final next = await widget.api.moreSourceEpisodes(
        current.sourceWorkRef.isNotEmpty
            ? current.sourceWorkRef
            : widget.item.ref,
        season: selectedSeason,
        offset: current.episodeNextOffset!,
      );
      if (!mounted) return;
      final byRef = {
        for (final ep in [...current.episodes, ...next.episodes]) ep.ref: ep,
      };
      final merged = current.copyWith(
        episodes: byRef.values.toList(),
        episodeNextOffset: next.episodeNextOffset,
        clearEpisodePagination: next.episodeNextOffset == null,
      );
      setState(() => future = Future.value(merged));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'تعذر تحميل بقية الفهرس. الحلقات التي وصلت محفوظة؛ أعد المحاولة.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingEpisodePage = false);
    }
  }

  FocusNode _episodeFocus(EpisodeItem episode) {
    final key = '${episode.id}:${episode.number}';
    return _episodeFocusNodes.putIfAbsent(
      key,
      () => FocusNode(debugLabel: 'details-episode-$key'),
    );
  }

  FocusNode _episodeDownloadFocus(EpisodeItem episode) {
    final key = '${episode.id}:${episode.number}';
    return _episodeDownloadFocusNodes.putIfAbsent(
      key,
      () => FocusNode(debugLabel: 'details-episode-download-$key'),
    );
  }

  CatalogItem _playItem(TitleDetails? details) => details == null
      ? widget.item
      : widget.item.copyWith(
          title: details.title,
          type:
              details.sourceWorkRef.isNotEmpty &&
                  ['movie', 'series'].contains(details.contentType)
              ? details.contentType
              : widget.item.type,
          poster: details.poster.isNotEmpty
              ? details.poster
              : widget.item.poster,
          year: details.year,
          genres: details.genres,
          audioLanguage: details.audioLanguage,
          edition: details.edition,
          imdbId: details.imdbId,
          identityVerified: details.identityVerified,
          workIdentityVerified: details.workIdentityVerified,
        );

  ({String ref, String id, int? number}) get _directContext {
    if (!RegExp(r'^tmdb:tv:[1-9][0-9]*$').hasMatch(widget.item.ref)) {
      return (ref: widget.item.ref, id: '', number: null);
    }
    final saved = widget.store.history
        .where((entry) => entry.contentRef == widget.item.ref)
        .firstOrNull;
    final season = widget.item.season ?? saved?.metadata?.season;
    final number = widget.item.episode ?? saved?.episodeNumber;
    if (season == null || number == null) {
      return (ref: widget.item.ref, id: '', number: null);
    }
    return (
      ref: '${widget.item.ref}:s$season:e$number',
      id: saved?.episodeNumber == number ? saved!.episodeId : '',
      number: number,
    );
  }

  Future<void> _openDirect(TitleDetails details) async {
    if (widget.onPlaySelection != null) {
      await widget.onPlaySelection!(_playItem(details), details, null);
      return;
    }
    await RouteFocusRestorer.push<void>(
      context,
      returnFocus: _directPlayFocus,
      route: MaterialPageRoute(
        builder: (_) => PlayerPage(
          api: widget.api,
          store: widget.store,
          item: _playItem(details),
          title: details.title,
          mediaPath: details.mediaPath,
          mediaType: details.mediaType,
          playbackMode: details.playbackMode,
          playbackHeaders: details.playbackHeaders,
          sourceRef: _directContext.ref,
          episodeId: _directContext.id,
          episodeNumber: _directContext.number,
          providerCatalogRef: _providersRef,
          searchMatches: widget.searchMatches,
        ),
      ),
    );
  }

  Future<void> _openEpisode(
    EpisodeItem episode,
    FocusNode returnFocus, {
    List<EpisodeItem> queue = const [],
  }) async {
    if (episode.ref.isEmpty || !episode.watchAvailable) return;
    if (widget.onPlaySelection != null) {
      await widget.onPlaySelection!(
        _playItem(await future),
        await future,
        episode,
      );
      return;
    }
    final label = episode.title.trim().isEmpty
        ? (episode.hasEpisodeNumber ? 'الحلقة ${episode.number}' : 'حلقة')
        : episode.title;
    await RouteFocusRestorer.push<void>(
      context,
      returnFocus: returnFocus,
      route: MaterialPageRoute(
        builder: (_) => PlayerPage(
          api: widget.api,
          store: widget.store,
          item: _playItem(widget.api.cachedMetadata(widget.item.ref))
              .copyWith(season: episode.season, episode: episode.number),
          title: label,
          sourceRef: episode.ref,
          providerCatalogRef: _providersRef,
          searchMatches: widget.searchMatches,
          episodeId: episode.id,
          episodeQueue: queue,
          episodeNumber: episode.hasEpisodeNumber ? episode.number : null,
        ),
      ),
    );
    if (mounted) setState(() {});
  }

  String _downloadLabel(String key) {
    final progress = _downloadProgress[key];
    if (progress == null) return 'جاري بدء التنزيل…';
    final received = progress.receivedBytes / (1024 * 1024);
    final fraction = progress.fraction;
    if (fraction != null) {
      return 'جاري التنزيل ${(fraction * 100).toStringAsFixed(0)}% • ${received.toStringAsFixed(1)} MB';
    }
    return 'جاري التنزيل • ${received.toStringAsFixed(1)} MB';
  }

  void _onDownloadProgress(String key, DownloadProgress progress) {
    if (!mounted) return;
    final last = _reportedBytes[key] ?? -1;
    final complete =
        progress.totalBytes != null &&
        progress.receivedBytes >= progress.totalBytes!;
    if (!complete && last >= 0 && progress.receivedBytes - last < 256 * 1024) {
      return;
    }
    _reportedBytes[key] = progress.receivedBytes;
    setState(() => _downloadProgress[key] = progress);
  }

  Future<void> _cancelDownload(String key) async {
    final token = _downloadTokens[key];
    if (token == null || token.isCancelled) return;
    if (!await najdConfirm(
      context,
      title: 'إلغاء التحميل الجاري؟',
      description: 'سيتم إيقاف التنزيل وحذف الملف الجزئي من الجهاز.',
      confirm: 'إلغاء التحميل',
      cancel: 'متابعة التحميل',
    )) {
      return;
    }
    token.cancel();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('جارٍ إلغاء التنزيل وحذف الملف الجزئي…')),
      );
    }
  }

  bool _seasonDownloading = false;
  Future<void> _downloadSeason(TitleDetails details) async {
    if (_seasonDownloading) {
      setState(() => _seasonDownloading = false);
      return;
    }
    final episodes = details.episodes
        .where((episode) => episode.watchAvailable && episode.ref.isNotEmpty)
        .toList(growable: false);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('تنزيل الموسم'),
        content: Text(
          'تنزيل ${episodes.length} حلقة متاحة بالتتابع؟ يعتمد التنزيل على وجود مصدر MP4 فعلي. يمكنك إيقاف الطابور.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('تنزيل'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _seasonDownloading = true);
    for (final episode in episodes) {
      if (!mounted || !_seasonDownloading) break;
      await _download(
        key: 'episode:${episode.id}:${episode.number}',
        title: '${details.title} — الحلقة ${episode.number}',
        sourceRef: episode.ref,
      );
    }
    if (mounted) setState(() => _seasonDownloading = false);
  }

  Future<void> _personWorks(Map<String, dynamic> person) async {
    final id = int.tryParse('${person['id']}');
    if (id == null) return;
    final future = widget.api.personWorks(id);
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (context) => Scaffold(
          appBar: AppBar(title: Text('أعمال ${person['name'] ?? ''}')),
          body: FutureBuilder<List<CatalogItem>>(
            future: future,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Center(
                  child: FilledButton.icon(
                    onPressed: () {
                      Navigator.pop(context);
                      _personWorks(person);
                    },
                    icon: const Icon(Icons.refresh),
                    label: const Text('تعذر تحميل الأعمال — إعادة المحاولة'),
                  ),
                );
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.data!.isEmpty) {
                return const Center(child: Text('لا توجد أعمال متاحة حالياً'));
              }
              return GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 220,
                  mainAxisExtent: 340,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                ),
                itemCount: snapshot.data!.length,
                itemBuilder: (context, index) {
                  final item = snapshot.data![index];
                  return NajdWorkCard(
                    item: item,
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => DetailsPage(
                            api: widget.api,
                            store: widget.store,
                            item: item,
                          ),
                        ),
                      );
                    },
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _download({
    required String key,
    required String title,
    String sourceRef = '',
  }) async {
    if (_activeDownloads.contains(key)) return;
    final token = DownloadCancellationToken();
    setState(() {
      _activeDownloads.add(key);
      _downloadTokens[key] = token;
      _downloadProgress.remove(key);
      _reportedBytes.remove(key);
    });
    try {
      final ref = sourceRef.isEmpty ? widget.item.ref : sourceRef;
      var source = widget.api.downloadableSource(ref);
      if (source == null) {
        await widget.api.resolvePlayback(ref, refresh: true);
        source = widget.api.downloadableSource(ref);
      }
      if (source == null) {
        throw const DownloadException('HLS_DOWNLOAD_UNSUPPORTED');
      }
      final downloadHeaders = source.headers;
      final uri = widget.api.mediaUri(
        source.mediaPath,
        download: true,
        playbackMode: 'edge_direct',
      );
      if (token.isCancelled) {
        throw const DownloadException('DOWNLOAD_CANCELLED');
      }
      final result = await _downloads.download(
        uri,
        fallbackName: title,
        headers: downloadHeaders,
        resumeKey: buildDownloadResumeKey(widget.item, key),
        cancellationToken: token,
        onProgress: (progress) => _onDownloadProgress(key, progress),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'اكتمل التنزيل داخل مساحة التطبيق • ${(result.bytes / (1024 * 1024)).toStringAsFixed(1)} MB',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      final code = error is DownloadException
          ? error.code
          : error is ApiException
          ? error.code
          : '';
      final message = switch (code) {
        'DOWNLOAD_CANCELLED' => 'تم إلغاء التنزيل وحذف الملف الجزئي.',
        'DOWNLOAD_STALLED' => 'توقف وصول البيانات لمدة 30 ثانية. تم الاحتفاظ بالتقدم ويمكن استكماله عند إعادة المحاولة.',
        'INCOMPLETE_DOWNLOAD' => 'انقطع التنزيل قبل اكتمال الملف. تم الاحتفاظ بالتقدم للاستكمال عند إعادة المحاولة.',
        'EMPTY_DOWNLOAD' => 'وصل رد فارغ من خادم التنزيل. أعد المحاولة لاحقًا.',
        'HLS_DOWNLOAD_UNSUPPORTED' =>
          'هذه النسخة متاحة للمشاهدة فقط. اختر نسخة MP4 من المصادر للتحميل.',
        'HTTP_401' || 'HTTP_403' || 'HTTP_410' => 'انتهت صلاحية رابط التنزيل أو رفضه المزود. أعد المحاولة لاستخراج رابط جديد.',
        'INVALID_DOWNLOAD_REFERENCE' || 'INVALID_DIRECT_MEDIA' =>
          'لم يصل رابط ملف قابل للتحميل من هذا المصدر. جرّب مصدراً آخر.',
        'SOURCE_INDEX_STILL_PENDING' ||
        'SOURCE_PLAYBACK_STILL_PENDING' ||
        'DISCOVERY_STILL_RUNNING' =>
          'لم يكتمل تجهيز المصدر بعد. أعد المحاولة بعد قليل.',
        _ => 'تعذر تنزيل هذا المصدر حاليًا. لم يتم فتح رابط خارجي.',
      };
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) {
        setState(() {
          _activeDownloads.remove(key);
          _downloadTokens.remove(key);
          _downloadProgress.remove(key);
          _reportedBytes.remove(key);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          title: Text(widget.item.title),
          actions: [
            IconButton(
              tooltip: widget.store.isFavorite(widget.item.ref)
                  ? 'إزالة من قائمتي'
                  : 'إضافة إلى قائمتي',
              onPressed: _toggleFavorite,
              icon: Icon(
                widget.store.isFavorite(widget.item.ref)
                    ? Icons.bookmark
                    : Icons.bookmark_border,
              ),
            ),
          ],
        ),
        body: FutureBuilder<TitleDetails>(
          future: future,
          initialData: widget.api.cachedMetadata(widget.item.ref),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const NajdSkeleton(details: true);
            }

            if (snapshot.hasError || snapshot.data == null) {
              return Center(
                child: FilledButton.icon(
                  onPressed: retry,
                  icon: const Icon(Icons.refresh),
                  label: Text(
                    '${snapshot.error}'.contains('SOURCE_INDEX_STILL_PENDING')
                        ? 'فهرسة المصدر لم تكتمل بعد؛ تحديث الحالة'
                        : 'تعذر تحميل التفاصيل، أعد المحاولة',
                  ),
                ),
              );
            }
            final baseDetails = snapshot.data!;
            final details = _seasonDetails == null
                ? baseDetails
                : baseDetails.copyWith(
                    episodes: _seasonDetails!.episodes,
                    season: selectedSeason,
                    sourceIndexPartial: _seasonDetails!.sourceIndexPartial,
                    episodeNextOffset: _seasonDetails!.episodeNextOffset,
                  );
            final sourceCard =
                details.sourceIndexAuthoritative &&
                widget.item.ref.startsWith('tmdb:');
            return ListView(
              padding: EdgeInsets.all(isTvTarget ? 28 : 16),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (details.poster.isNotEmpty) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                          width: isTvTarget ? 160 : 110,
                          height: isTvTarget ? 240 : 165,
                          child: NajdPoster(url: details.poster),
                        ),
                      ),
                      const SizedBox(width: 16),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            details.title,
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            children: [
                              if (details.year != null)
                                Chip(label: Text('${details.year}')),
                              for (final genre in details.genres)
                                Chip(label: Text(genre)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                if (details.sourceIndexPartial)
                  const NajdSurface(
                    child: Text(
                      'فهرسة الموقع غير مكتملة. يمكنك تشغيل الحلقات الظاهرة أو تحديث الفهرس لمحاولة استكماله.',
                    ),
                  ),
                if (details.plot.isNotEmpty)
                  NajdSurface(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const NajdSectionHeading('قصة العمل'),
                        Text(
                          details.plot,
                          style: Theme.of(context).textTheme.bodyLarge
                              ?.copyWith(height: 1.8),
                        ),
                      ],
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      FilledButton.icon(
                        key: const Key('title-watch'),
                        focusNode: details.hasEpisodes
                            ? null
                            : _directPlayFocus,
                        onPressed: _seasonBusy || _seasonError != null
                            ? null
                            : () => _watch(details),
                        icon: const Icon(Icons.play_arrow),
                        label: const Text('مشاهدة'),
                      ),
                      if (!kIsWeb)
                        OutlinedButton.icon(
                          key: const Key('title-download'),
                          onPressed: _seasonBusy || _seasonError != null
                              ? null
                              : () => _downloadPrimary(details),
                          icon: Icon(
                            _activeDownloads.contains(_primaryDownloadKey)
                                ? Icons.cancel_outlined
                                : Icons.download_outlined,
                          ),
                          label: Text(
                            _activeDownloads.contains(_primaryDownloadKey)
                                ? _downloadLabel(_primaryDownloadKey)
                                : 'تحميل',
                          ),
                        ),
                      if (!widget.api.providerBrowser)
                        OutlinedButton.icon(
                          key: const Key('title-providers'),
                          onPressed: _showProviders,
                          icon: const Icon(Icons.dns_outlined),
                          label: const Text('المصادر'),
                        ),
                    ],
                  ),
                ),
                if (details.sourceWorkRef.isNotEmpty ||
                    widget.item.ref.startsWith('source:'))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        OutlinedButton.icon(
                          key: const Key('source-index-refresh'),
                          onPressed: _refreshingSourceIndex
                              ? null
                              : () => _refreshSourceIndex(
                                  details.sourceWorkRef.isNotEmpty
                                      ? details.sourceWorkRef
                                      : widget.item.ref.replaceFirst(
                                          RegExp(r':s\d+:e\d+$'),
                                          '',
                                        ),
                                ),
                          icon: _refreshingSourceIndex
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.sync),
                          label: const Text('تحديث الفهرس الآن'),
                        ),
                        if (_sourceRefreshMessage != null)
                          Text(
                            _sourceRefreshMessage!,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                      ],
                    ),
                  ),
                if (widget.item.ref.startsWith('tmdb:'))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: NajdChoiceButton<String>(
                      key: const Key('details-metadata-language'),
                      label: 'لغة الاسم والملخص',
                      icon: Icons.translate,
                      options: [
                        for (final entry in [
                          ('auto', 'تلقائي'),
                          ('ar', 'العربية'),
                          ('en', 'English'),
                        ])
                          NajdOption(
                            entry.$1,
                            entry.$2,
                            selected:
                                (_metadataLanguage ??
                                    NajdPreferences
                                        .instance
                                        .metadataLanguage) ==
                                entry.$1,
                          ),
                      ],
                      onSelected: (value) async {
                        setState(() {
                          _metadataLanguage = value;
                          future = _loadDetails(widget.item.ref);
                        });
                      },
                    ),
                  ),
                if (details.directors.isNotEmpty)
                  Text('إخراج: ${details.directors.join('، ')}'),
                if (details.cast.isNotEmpty ||
                    details.directorPeople.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: SizedBox(
                      height: 206,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount:
                            details.directorPeople.length + details.cast.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 10),
                        itemBuilder: (context, index) {
                          final person = [
                            ...details.directorPeople,
                            ...details.cast,
                          ][index];
                          return SizedBox(
                            width: 116,
                            child: Card(
                              clipBehavior: Clip.antiAlias,
                              child: InkWell(
                                onTap: person['id'] == null
                                    ? null
                                    : () => _personWorks(person),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    SizedBox(
                                      height: 126,
                                      child: NajdPoster(
                                        url: '${person['photo'] ?? ''}',
                                      ),
                                    ),
                                    Expanded(
                                      child: SingleChildScrollView(
                                        padding: const EdgeInsets.all(8),
                                        child: Column(
                                          children: [
                                            Text(
                                              '${person['name'] ?? ''}',
                                              textAlign: TextAlign.center,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelLarge,
                                            ),
                                            if (person['role'] == 'Director')
                                              Text(
                                                'إخراج',
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .bodySmall,
                                              ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                if (details.sourceWorkRef.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      '${details.sourceProvider} • ${details.sourceEdition == 'dubbed'
                          ? 'مدبلج — نسخة مستقلة'
                          : details.sourceEdition == 'subtitled'
                          ? 'مترجم'
                          : 'نسخة المصدر'} — الترقيم حسب هذا المصدر',
                    ),
                  ),
                if (!sourceCard &&
                    details.availableSeasons.length > 1 &&
                    (widget.item.ref.startsWith('tmdb:tv:') ||
                        details.sourceWorkRef.isNotEmpty))
                  NajdSurface(
                    padding: EdgeInsets.zero,
                    child: ListTile(
                      key: const Key('title-season-selector'),
                      leading: const Icon(Icons.video_library_outlined),
                      title: const Text('الموسم'),
                      subtitle: Text('الموسم $selectedSeason'),
                      trailing: const Icon(Icons.expand_more),
                      onTap: () async {
                        final value = await showNajdOptions<int>(
                          context,
                          title: 'اختيار الموسم',
                          icon: Icons.video_library_outlined,
                          options: [
                            for (final number in details.availableSeasons)
                              NajdOption(
                                number,
                                'الموسم $number',
                                selected: number == selectedSeason,
                                icon: Icons.video_library_outlined,
                              ),
                          ],
                        );
                        if (!mounted ||
                            value == null ||
                            value == selectedSeason) {
                          return;
                        }
                        await _changeSeason(baseDetails, value);
                      },
                    ),
                  ),
                if (_seasonBusy)
                  const Padding(
                    padding: EdgeInsets.all(12),
                    child: LinearProgressIndicator(
                      key: Key('season-episodes-loading'),
                    ),
                  ),
                if (_seasonError != null)
                  TextButton(
                    onPressed: () => _changeSeason(baseDetails, selectedSeason),
                    child: Text(_seasonError!),
                  ),
                if (!sourceCard &&
                    details.hasEpisodes &&
                    !_seasonBusy &&
                    _seasonError == null) ...[
                  NajdSectionHeading('الحلقات (${details.episodes.length})'),
                  TextButton.icon(
                    onPressed: () => _downloadSeason(details),
                    icon: Icon(
                      _seasonDownloading ? Icons.stop : Icons.download,
                    ),
                    label: Text(
                      _seasonDownloading
                          ? 'إيقاف طابور الموسم'
                          : 'تنزيل الموسم',
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...details.episodes.map((episode) {
                    final key = 'episode:${episode.id}:${episode.number}';
                    final focusNode = _episodeFocus(episode);
                    return _EpisodeTile(
                      downloadAvailable:
                          !kIsWeb &&
                          (widget.api.cachedPlayback(episode.ref) == null ||
                              widget.api.downloadableSource(episode.ref) !=
                                  null),
                      episode: episode,
                      focusNode: focusNode,
                      downloadFocusNode: isTvTarget
                          ? _episodeDownloadFocus(episode)
                          : null,
                      downloading: _activeDownloads.contains(key),
                      downloadLabel: _downloadLabel(key),
                      onTap: () => _openEpisode(
                        episode,
                        focusNode,
                        queue: details.episodes,
                      ),
                      onDownload: () => _download(
                        key: key,
                        title: '${details.title} - الحلقة ${episode.number}',
                        sourceRef: episode.ref,
                      ),
                      onCancelDownload: () => _cancelDownload(key),
                    );
                  }),
                  if (details.episodeNextOffset != null)
                    TextButton.icon(
                      onPressed: _loadingEpisodePage ? null : _moreEpisodes,
                      icon: const Icon(Icons.expand_more),
                      label: Text(
                        _loadingEpisodePage
                            ? 'جارٍ تحميل بقية الفهرس…'
                            : 'تحميل المزيد من حلقات المصدر',
                      ),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _EpisodeTile extends StatelessWidget {
  const _EpisodeTile({
    this.downloadAvailable = true,
    required this.episode,
    required this.focusNode,
    required this.onTap,
    required this.onDownload,
    required this.onCancelDownload,
    required this.downloading,
    required this.downloadLabel,
    this.downloadFocusNode,
  });

  final EpisodeItem episode;
  final FocusNode focusNode;
  final FocusNode? downloadFocusNode;
  final VoidCallback onTap;
  final VoidCallback onDownload;
  final bool downloadAvailable;
  final VoidCallback onCancelDownload;
  final bool downloading;
  final String downloadLabel;

  @override
  Widget build(BuildContext context) {
    final label = episode.title.trim().isEmpty
        ? (episode.hasEpisodeNumber ? 'الحلقة ${episode.number}' : 'حلقة')
        : episode.title;
    final enabled = episode.watchAvailable && episode.ref.isNotEmpty;

    if (isTvTarget) {
      return Card(
        child: FocusTraversalGroup(
          policy: OrderedTraversalPolicy(),
          child: Row(
            children: [
              Expanded(
                child: FocusTraversalOrder(
                  order: const NumericFocusOrder(1),
                  child: ListTile(
                    key: ValueKey('episode-play-${episode.id}'),
                    focusNode: focusNode,
                    enabled: enabled,
                    leading: CircleAvatar(
                      child: Text(
                        episode.hasEpisodeNumber ? '${episode.number}' : '▶',
                      ),
                    ),
                    title: Text(label),
                    subtitle: Text(
                      downloading
                          ? downloadLabel
                          : (downloadAvailable
                                ? 'اضغط موافق للتشغيل، وانتقل إلى زر التنزيل عند الحاجة'
                                : 'اضغط موافق لتشغيل الحلقة'),
                    ),
                    trailing: enabled
                        ? const Icon(Icons.play_arrow)
                        : const Icon(Icons.block),
                    onTap: enabled ? onTap : null,
                  ),
                ),
              ),
              if (enabled && downloadAvailable)
                FocusTraversalOrder(
                  order: const NumericFocusOrder(2),
                  child: IconButton(
                    key: ValueKey('episode-download-${episode.id}'),
                    focusNode: downloadFocusNode,
                    tooltip: downloading ? 'إلغاء التنزيل' : 'تنزيل الحلقة',
                    onPressed: downloading ? onCancelDownload : onDownload,
                    icon: Icon(
                      downloading
                          ? Icons.cancel_outlined
                          : Icons.download_outlined,
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    }

    return Card(
      child: ListTile(
        key: ValueKey('episode-play-${episode.id}'),
        focusNode: focusNode,
        enabled: enabled,
        leading: CircleAvatar(
          child: Text(episode.hasEpisodeNumber ? '${episode.number}' : '▶'),
        ),
        title: Text(label),
        subtitle: Text(
          downloading
              ? '$downloadLabel • اضغط زر الإلغاء لإيقافه'
              : (enabled
                    ? (downloadAvailable
                          ? 'مشاهدة أو تنزيل الحلقة'
                          : 'مشاهدة الحلقة')
                    : 'المشاهدة غير متاحة حاليًا'),
        ),
        trailing: enabled
            ? Wrap(
                spacing: 4,
                children: [
                  if (downloadAvailable)
                    IconButton(
                      key: ValueKey('episode-download-${episode.id}'),
                      tooltip: downloading ? 'إلغاء التنزيل' : 'تنزيل الحلقة',
                      onPressed: downloading ? onCancelDownload : onDownload,
                      icon: Icon(
                        downloading
                            ? Icons.cancel_outlined
                            : Icons.download_outlined,
                      ),
                    ),
                  IconButton(
                    key: ValueKey('episode-play-button-${episode.id}'),
                    tooltip: 'تشغيل الحلقة',
                    onPressed: onTap,
                    icon: const Icon(Icons.play_arrow),
                  ),
                ],
              )
            : const Icon(Icons.block),
        onTap: enabled ? onTap : null,
      ),
    );
  }
}
