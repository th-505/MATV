import 'package:flutter/material.dart';

/// Shared product contract; keep in step with web/core/ui-contract.js.
class TatvUi {
  static const brand = 'T-A-TV';
  static const sidebarBreakpoint = 900.0;
  static const background = Color(0xFF07090B);
  static const surface = Color(0xFF0D1117);
  static const elevated = Color(0xFF121824);
  static const accent = Color(0xFFE8BD75);
  static const accentLight = Color(0xFFF7D594);
  static const accentDark = Color(0xFFB88B3E);
  static const text = Color(0xFFFFFFFF);
  static const secondaryText = Color(0xFF94A3B8);
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
    'المفضلة',
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
    Icons.favorite_outline,
    Icons.settings_outlined,
  ];
}
