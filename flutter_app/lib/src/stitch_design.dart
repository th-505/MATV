import 'package:flutter/material.dart';

import 'app_target.dart';
import 'models.dart';

/// Shared native components derived from the approved Najd Stitch interface.
/// These widgets are used by production routes, not an HTML/gallery shell.
class NajdDesign {
  static const primary = Color(0xFF6B46C1);
  static const darkBackground = Color(0xFF121118);
  static const darkSurface = Color(0xFF1D1A25);
  static const lightBackground = Color(0xFFFAF8FF);
  static const radius = 20.0;
}

class NajdSectionHeading extends StatelessWidget {
  const NajdSectionHeading(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 20, bottom: 12),
    child: Row(
      children: [
        Container(
          width: 4,
          height: 21,
          decoration: BoxDecoration(
            color: NajdDesign.primary,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
        ),
        if (action != null)
          TextButton(onPressed: onAction, child: Text(action!)),
      ],
    ),
  );
}

class NajdSurface extends StatelessWidget {
  const NajdSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.margin = const EdgeInsets.symmetric(vertical: 8),
  });
  final Widget child;
  final EdgeInsets padding, margin;
  @override
  Widget build(BuildContext context) => Padding(
    padding: margin,
    child: Material(
      color: Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outline.withAlpha(75),
        ),
      ),
      child: Padding(padding: padding, child: child),
    ),
  );
}

class NajdPoster extends StatelessWidget {
  const NajdPoster({super.key, required this.url, this.fit = BoxFit.cover});
  final String url;
  final BoxFit fit;
  @override
  Widget build(BuildContext context) {
    final placeholder = ColoredBox(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Center(
        child: Icon(
          Icons.movie_outlined,
          size: 44,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
    if (url.isEmpty) return placeholder;
    return Image.network(
      url,
      fit: fit,
      cacheWidth: isTvTarget ? 800 : 500,
      errorBuilder: (_, _, _) => placeholder,
    );
  }
}

class NajdWorkCard extends StatelessWidget {
  const NajdWorkCard({
    super.key,
    required this.item,
    required this.onTap,
    this.selected = false,
    this.onSelect,
  });
  final CatalogItem item;
  final VoidCallback onTap;
  final bool selected;
  final VoidCallback? onSelect;
  @override
  Widget build(BuildContext context) => Card(
    key: ValueKey('stitch-work-${item.id}'),
    margin: EdgeInsets.zero,
    clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(16),
      side: BorderSide(
        color: selected
            ? NajdDesign.primary
            : Theme.of(context).colorScheme.outline.withAlpha(60),
        width: selected ? 2 : 1,
      ),
    ),
    child: InkWell(
      onTap: onSelect ?? onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                NajdPoster(url: item.poster),
                Positioned(
                  top: 9,
                  right: 9,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withAlpha(175),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      item.type == 'movie'
                          ? 'فيلم'
                          : item.type == 'anime'
                          ? 'أنمي'
                          : 'مسلسل',
                      style: const TextStyle(color: Colors.white, fontSize: 11),
                    ),
                  ),
                ),
                if (onSelect != null)
                  Positioned(
                    left: 8,
                    top: 8,
                    child: Icon(
                      selected
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                      color: selected ? NajdDesign.primary : Colors.white,
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        [
                          if (item.year != null) '${item.year}',
                          ...item.genres.take(1),
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                    if (item.rating > 0)
                      Text(
                        '★ ${item.rating.toStringAsFixed(1)}',
                        style: const TextStyle(
                          color: NajdDesign.primary,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class NajdFeatureHero extends StatelessWidget {
  const NajdFeatureHero({
    super.key,
    required this.item,
    required this.onWatch,
    required this.onSave,
    required this.saved,
  });
  final CatalogItem item;
  final VoidCallback onWatch, onSave;
  final bool saved;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, bounds) => SizedBox(
      key: const Key('stitch-feature-hero'),
      height: bounds.maxWidth < 600 ? 430 : 480,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          fit: StackFit.expand,
          children: [
            NajdPoster(url: item.poster),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: [0, .35, 1],
                  colors: [
                    Color(0x10000000),
                    Color(0x55000000),
                    Color(0xFA121118),
                  ],
                ),
              ),
            ),
            Positioned(
              left: 22,
              right: 22,
              bottom: 24,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    children: [
                      if (item.year != null) _HeroTag('${item.year}'),
                      if (item.rating > 0)
                        _HeroTag('★ ${item.rating.toStringAsFixed(1)}'),
                      _HeroTag(item.type == 'movie' ? 'فيلم' : 'مسلسل'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      height: 1.4,
                    ),
                  ),
                  if (item.genres.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        item.genres.take(3).join(' · '),
                        style: const TextStyle(color: Color(0xFFE6DDF7)),
                      ),
                    ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          key: const Key('stitch-hero-watch'),
                          onPressed: onWatch,
                          icon: const Icon(Icons.play_arrow_rounded),
                          label: const Text('مشاهدة الآن'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onSave,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: const BorderSide(color: Colors.white54),
                            minimumSize: const Size(48, 52),
                          ),
                          icon: Icon(
                            saved
                                ? Icons.bookmark
                                : Icons.bookmark_add_outlined,
                          ),
                          label: const Text('قائمتي'),
                        ),
                      ),
                    ],
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

class _HeroTag extends StatelessWidget {
  const _HeroTag(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.white.withAlpha(30),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      text,
      style: const TextStyle(color: Colors.white, fontSize: 12),
    ),
  );
}

enum NajdEmptyKind {
  offline,
  source,
  search,
  watchlist,
  history,
  downloads,
  storage,
}

class NajdEmptyState extends StatelessWidget {
  const NajdEmptyState({
    super.key,
    required this.kind,
    this.onRetry,
    this.onExplore,
    this.message,
  });
  final NajdEmptyKind kind;
  final VoidCallback? onRetry, onExplore;
  final String? message;
  @override
  Widget build(BuildContext context) {
    final (icon, title, description, action) = switch (kind) {
      NajdEmptyKind.offline => (
        Icons.wifi_off_rounded,
        'لا يوجد اتصال بالإنترنت',
        'تحقق من الاتصال أو انتقل إلى أعمالك المحمّلة.',
        'إعادة المحاولة',
      ),
      NajdEmptyKind.source => (
        Icons.videocam_off_outlined,
        'لا يتوفر مصدر تشغيل حاليًا',
        'يمكنك إعادة فحص المصادر أو العودة لتفاصيل العمل.',
        'إعادة الفحص',
      ),
      NajdEmptyKind.search => (
        Icons.search_off_rounded,
        'لا توجد نتائج مطابقة',
        'جرّب اسمًا آخر أو امسح الفلاتر لتوسيع النتائج.',
        'تعديل البحث',
      ),
      NajdEmptyKind.watchlist => (
        Icons.bookmark_border_rounded,
        'قائمتك فارغة حاليًا',
        'احفظ الأفلام والمسلسلات التي تعجبك لتجدها هنا.',
        'استكشف الأعمال',
      ),
      NajdEmptyKind.history => (
        Icons.history_rounded,
        'سجل المشاهدة فارغ',
        'الأعمال التي تبدأ بمشاهدتها تظهر هنا للمتابعة من حيث توقفت.',
        'تصفح الأعمال',
      ),
      NajdEmptyKind.downloads => (
        Icons.download_for_offline_outlined,
        'لا توجد تحميلات حتى الآن',
        'حمّل أعمالك المفضلة لمشاهدتها دون اتصال بالإنترنت.',
        'استكشف الأعمال',
      ),
      NajdEmptyKind.storage => (
        Icons.storage_rounded,
        'المساحة المتاحة لا تكفي',
        'حرّر بعض المساحة من التحميلات ثم حاول مجددًا.',
        'إدارة التحميلات',
      ),
    };
    return Center(
      key: ValueKey('stitch-state-${kind.name}'),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 36),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: NajdDesign.primary.withAlpha(30),
                  borderRadius: BorderRadius.circular(30),
                ),
                child: Icon(
                  icon,
                  size: 44,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              Text(
                message ?? description,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  height: 1.7,
                ),
              ),
              const SizedBox(height: 24),
              if (onRetry != null || onExplore != null)
                SizedBox(
                  width: 320,
                  child: FilledButton(
                    onPressed: onRetry ?? onExplore,
                    child: Text(action),
                  ),
                ),
              if (onRetry != null && onExplore != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: OutlinedButton(
                    onPressed: onExplore,
                    child: Text(
                      kind == NajdEmptyKind.offline ? 'التحميلات' : 'العودة',
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class NajdSkeleton extends StatelessWidget {
  const NajdSkeleton({super.key, this.details = false});
  final bool details;
  @override
  Widget build(BuildContext context) {
    Widget block(double height, {double? width}) => Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
    );
    return SingleChildScrollView(
      key: const Key('stitch-skeleton'),
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          block(details ? 300 : 240),
          const SizedBox(height: 20),
          block(22, width: 220),
          const SizedBox(height: 12),
          block(14, width: 150),
          const SizedBox(height: 24),
          for (var i = 0; i < 2; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Row(
                children: [
                  Expanded(child: block(210)),
                  const SizedBox(width: 16),
                  Expanded(child: block(210)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

Future<bool> najdConfirm(
  BuildContext context, {
  required String title,
  required String description,
  required String confirm,
  String cancel = 'إلغاء',
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(description),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(confirm),
          ),
        ],
      ),
    ) ??
    false;
