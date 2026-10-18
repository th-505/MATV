import 'dart:async';
import 'title_overview_header.dart';
import 'package:flutter/material.dart';
import 'api_client.dart';
import 'app_target.dart';
import 'download_service.dart';
import 'library_store.dart';
import 'models.dart';
import 'player_page.dart';
import 'route_focus_restorer.dart';

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
  });

  final MitvApi api;
  final LocalLibraryStore store;
  final CatalogItem item;
  final DownloadService? downloads;

  @override
  State<DetailsPage> createState() => _DetailsPageState();
}

class _DetailsPageState extends State<DetailsPage> {
  late Future<TitleDetails> future;
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
    _downloads = widget.downloads ?? DownloadService();
    _ownsDownloads = widget.downloads == null;
    widget.api.rememberIdentity(widget.item);
    future = widget.api.details(widget.item.ref);
    unawaited(_loadSources());
  }

  Future<void> _loadSources() async {
    try {
      await widget.api.searchProviders();
    } catch (_) {
      // The shared API state exposes the failure and enables the retry action.
    }
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

  void retry() => setState(() => future = widget.api.details(widget.item.ref));

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
          year: details.year,
          genres: details.genres,
          audioLanguage: details.audioLanguage,
          edition: details.edition,
          imdbId: details.imdbId,
          identityVerified: details.identityVerified,
          workIdentityVerified: details.workIdentityVerified,
        );

  Future<void> _openDirect(TitleDetails details) async {
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
          sourceRef: widget.item.ref,
        ),
      ),
    );
  }

  Future<void> _openEpisode(EpisodeItem episode, FocusNode returnFocus) async {
    if (episode.ref.isEmpty || !episode.watchAvailable) return;
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
          item: _playItem(
            widget.api.cachedMetadata(widget.item.ref),
          ).copyWith(season: episode.season),
          title: label,
          sourceRef: episode.ref,
          episodeId: episode.id,
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

  void _cancelDownload(String key) {
    final token = _downloadTokens[key];
    if (token == null || token.isCancelled) return;
    token.cancel();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('جارٍ إلغاء التنزيل وحذف الملف الجزئي…')),
      );
    }
  }

  Future<void> _download({
    required String key,
    required String title,
    String mediaPath = '',
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
      final code = error is DownloadException ? error.code : '';
      final message = switch (code) {
        'DOWNLOAD_CANCELLED' => 'تم إلغاء التنزيل وحذف الملف الجزئي.',
        'DOWNLOAD_STALLED' =>
          'توقف وصول البيانات لمدة 30 ثانية. تم الاحتفاظ بالتقدم ويمكن استكماله عند إعادة المحاولة.',
        'INCOMPLETE_DOWNLOAD' =>
          'انقطع التنزيل قبل اكتمال الملف. تم الاحتفاظ بالتقدم للاستكمال عند إعادة المحاولة.',
        'EMPTY_DOWNLOAD' => 'وصل رد فارغ من خادم التنزيل. أعد المحاولة لاحقًا.',
        _ => 'تعذر تنزيل هذا المصدر حاليًا. لم يتم فتح رابط خارجي.',
      };
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
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
      animation: Listenable.merge([widget.store, widget.api.sourceMetadataChanges]),
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          title: Text(
            [widget.item.title, widget.api.sourceDisplayLabel(widget.item)]
                .where((s) => s.isNotEmpty)
                .join(' • '),
          ),
          actions: [
            if (widget.api.sourceMetadataLoading)
              const Padding(
                padding: EdgeInsets.all(12),
                child: SizedBox(
                  width: 18, height: 18, child: CircularProgressIndicator(),
                ),
              ),
            if (widget.api.sourceMetadataError != null)
              IconButton(
                tooltip: 'إعادة محاولة تحميل المصادر',
                icon: const Icon(Icons.refresh),
                onPressed: () => unawaited(_loadSources()),
              ),
            IconButton(
              tooltip: widget.store.isFavorite(widget.item.ref)
                  ? 'إزالة من المفضلة'
                  : 'إضافة إلى المفضلة',
              onPressed: () => widget.store.toggleFavorite(widget.item),
              icon: Icon(
                widget.store.isFavorite(widget.item.ref)
                    ? Icons.favorite
                    : Icons.favorite_border,
              ),
            ),
          ],
        ),
        body: FutureBuilder<TitleDetails>(
          future: future,
          initialData: widget.api.cachedMetadata(widget.item.ref),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              final cached = snapshot.data;
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (cached?.poster.isNotEmpty == true)
                      SizedBox(
                        height: 280,
                        child: Image.network(
                          cached!.poster,
                          fit: BoxFit.contain,
                        ),
                      ),
                    if (cached != null)
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(cached.title),
                      ),
                    const CircularProgressIndicator(),
                  ],
                ),
              );
            }
            if (snapshot.hasError || snapshot.data == null) {
              return Center(
                child: FilledButton.icon(
                  onPressed: retry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('تعذر تحميل التفاصيل، أعد المحاولة'),
                ),
              );
            }
            final details = snapshot.data!;
            return ListView(
              padding: EdgeInsets.all(isTvTarget ? 28 : 16),
              children: [
                TitleOverviewHeader(
                  title:details.title,poster:details.poster,plot:details.plot,
                  facts:[
                    if(details.year!=null) '${details.year}',
                    if((widget.item.runtimeMinutes??0)>0) '${widget.item.runtimeMinutes} د',
                    if(details.season!=null) 'S${details.season}',
                    if(details.episode!=null) 'E${details.episode}',
                    if(details.episodes.isNotEmpty) '${details.episodes.length} حلقات متاحة',
                  ],
                ),
                const SizedBox(height: 12),
                if (details.hasEpisodes) ...[
                  Text(
                    'الحلقات',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  ...details.episodes.map((episode) {
                    final key = 'episode:${episode.id}:${episode.number}';
                    final focusNode = _episodeFocus(episode);
                    return _EpisodeTile(
                      downloadAvailable:
                          widget.api.downloadableSource(episode.ref) != null,
                      episode: episode,
                      focusNode: focusNode,
                      downloadFocusNode: isTvTarget
                          ? _episodeDownloadFocus(episode)
                          : null,
                      downloading: _activeDownloads.contains(key),
                      downloadLabel: _downloadLabel(key),
                      onTap: () => _openEpisode(episode, focusNode),
                      onDownload: () => _download(
                        key: key,
                        title: '${details.title} - الحلقة ${episode.number}',
                        sourceRef: episode.ref,
                      ),
                      onCancelDownload: () => _cancelDownload(key),
                    );
                  }),
                ] else if (details.canPlay) ...[
                  Card(
                    child: ListTile(
                      focusNode: _directPlayFocus,
                      leading: const Icon(Icons.play_circle_outline),
                      title: const Text('مشاهدة داخل التطبيق'),
                      subtitle: const Text(
                        'تشغيل تلقائي للصيغ المدعومة مع تبديل المصدر عند الحاجة',
                      ),
                      trailing: const Icon(Icons.play_arrow),
                      onTap: () => _openDirect(details),
                    ),
                  ),
                  if (widget.api.usesEdge
                      ? widget.api.downloadableSource(widget.item.ref) != null
                      : details.downloadAvailable && details.mediaType == 'mp4')
                    Card(
                      child: ListTile(
                        leading: _activeDownloads.contains('direct')
                            ? const Icon(Icons.cancel_outlined)
                            : const Icon(Icons.download_outlined),
                        title: Text(
                          _activeDownloads.contains('direct')
                              ? _downloadLabel('direct')
                              : 'تنزيل داخل التطبيق',
                        ),
                        subtitle: Text(
                          _activeDownloads.contains('direct')
                              ? 'اضغط لإلغاء التنزيل وحذف الملف الجزئي'
                              : 'يحفظ الملف داخل مساحة التطبيق مع متابعة فعلية للتقدم',
                        ),
                        onTap: _activeDownloads.contains('direct')
                            ? () => _cancelDownload('direct')
                            : () => _download(
                                key: 'direct',
                                title: details.title,
                                mediaPath: details.mediaPath,
                              ),
                      ),
                    ),
                ] else if (details.playbackUnavailable)
                  const ListTile(
                    leading: Icon(Icons.info_outline),
                    title: Text('المشاهدة غير متاحة من هذا المصدر حاليًا'),
                    subtitle: Text(
                      'يمكن إعادة المحاولة لاحقًا دون فتح روابط خارجية.',
                    ),
                  )
                else
                  const ListTile(
                    title: Text('لا توجد حلقات أو وسائط متاحة حاليًا'),
                  ),
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
