import 'package:flutter/foundation.dart';

enum AppTarget { mobile, tv, ios, desktop }

AppTarget parseAppTarget(String value) {
  switch (value.trim().toLowerCase()) {
    case 'tv':
      return AppTarget.tv;
    case 'ios':
      return AppTarget.ios;
    case 'desktop':
      return AppTarget.desktop;
    case 'mobile':
    default:
      return AppTarget.mobile;
  }
}

const String appTargetValue = String.fromEnvironment(
  'MITV_TARGET',
  defaultValue: 'mobile',
);

final AppTarget appTarget = parseAppTarget(appTargetValue);

bool get isTvTarget => appTarget == AppTarget.tv;

bool get isDesktopTarget =>
    !kIsWeb &&
    [TargetPlatform.windows, TargetPlatform.linux, TargetPlatform.macOS]
        .contains(defaultTargetPlatform);
