import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_target.dart';

/// Internal layout evidence only. Never infer physical inches from unreliable DPI.
class NajdViewportProfile {
  static const storageKey = 'najd.viewport.profile.v1';
  static double tvScale(Size size) => (size.width / 1280).clamp(1.1, 1.6);
  static Map<String, Object> measure(MediaQueryData media) => {
    'schema_version': 1,
    'logical_width': media.size.width,
    'logical_height': media.size.height,
    'physical_width': (media.size.width * media.devicePixelRatio).round(),
    'physical_height': (media.size.height * media.devicePixelRatio).round(),
    'device_pixel_ratio': media.devicePixelRatio,
    'safe_left': media.viewPadding.left,
    'safe_top': media.viewPadding.top,
    'safe_right': media.viewPadding.right,
    'safe_bottom': media.viewPadding.bottom,
    'system_text_scale': media.textScaler.scale(16) / 16,
    'layout': isTvTarget
        ? 'tv'
        : media.size.width >= 900
        ? 'wide'
        : 'compact',
    'tv_text_multiplier': isTvTarget ? tvScale(media.size) : 1.0,
    'minimum_control_extent': isTvTarget ? 64 : 48,
    'orientation': media.size.width > media.size.height
        ? 'landscape'
        : 'portrait',
  };
  static Future<void> save(Map<String, Object> profile) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(storageKey, jsonEncode(profile));
  }
}
