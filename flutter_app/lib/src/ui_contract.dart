import 'package:flutter/material.dart';

/// Shared product contract; keep in step with web/core/ui-contract.js.
class NajdUi {
  static const brand = 'نجد — Najd TV';
  static const bottomPages = <int>[0, 5, 7, 8];
  static const regions =
      <
        ({String id, String label, String category, String kind, IconData icon})
      >[
        (
          id: 'arabic',
          label: 'عربي',
          category: 'catalog:tv:ar',
          kind: 'series',
          icon: Icons.language,
        ),
        (
          id: 'foreign',
          label: 'أجنبي',
          category: 'catalog:tv:en',
          kind: 'series',
          icon: Icons.public,
        ),
        (
          id: 'anime',
          label: 'أنمي',
          category: 'catalog:anime:tv',
          kind: 'anime',
          icon: Icons.animation,
        ),
        (
          id: 'turkish',
          label: 'تركي',
          category: 'catalog:turkish:tv',
          kind: 'turkish',
          icon: Icons.travel_explore,
        ),
        (
          id: 'asian',
          label: 'آسيوي',
          category: 'catalog:tv:ko',
          kind: 'series',
          icon: Icons.explore,
        ),
      ];
  static const sidebarBreakpoint = 900.0;
  static const background = Color(0xFF121118);
  static const surface = Color(0xFF1D1A25);
  static const elevated = Color(0xFF201D30);
  static const accent = Color(0xFF6B46C1);
  static const accentLight = Color(0xFFB69AE9);
  static const accentDark = Color(0xFF55349C);
  static const text = Color(0xFFF8F7FF);
  static const secondaryText = Color(0xFFBCB8CF);
  static const pageIds = <String>[
    'home',
    'movies',
    'series',
    'anime',
    'turkish',
    'search',
    'live',
    'favorites',
    'settings',
  ];
  static const labels = <String>[
    'الرئيسية',
    'الأفلام',
    'المسلسلات',
    'الأنمي',
    'التركي',
    'البحث',
    'البث المباشر',
    'قائمتي',
    'الإعدادات',
  ];
  static const icons = <IconData>[
    Icons.home_outlined,
    Icons.movie_outlined,
    Icons.video_library_outlined,
    Icons.animation,
    Icons.language,
    Icons.search,
    Icons.live_tv,
    Icons.bookmark_border,
    Icons.settings_outlined,
  ];
}
