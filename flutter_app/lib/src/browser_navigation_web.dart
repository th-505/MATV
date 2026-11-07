import 'browser_content_route.dart';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'dart:js_interop';
import 'dart:js_interop_unsafe';

@JS('window')
external JSObject get _window;

/// Hash routes work on GitHub Pages without server-side rewrite support.
class BrowserNavigation {
  JSFunction? _listener;
  static Future<void>? _historyReady;
  static bool _initializingHistory = false;
  Future<void> get ready => _ensureHistory();
  Future<void> _ensureHistory() => _historyReady ??= (() async {
    final initial = currentRoute;
    _initializingHistory = true;
    try {
      await SystemNavigator.selectMultiEntryHistory();
      await SystemNavigator.routeInformationUpdated(
        uri: initial,
        replace: true,
      );
    } finally {
      _initializingHistory = false;
    }
  })();
  static final _contentRoutes = <Object, Uri>{};
  Uri get currentRoute {
    final hash = _window
        .getProperty<JSObject>('location'.toJS)
        .getProperty<JSString>('hash'.toJS)
        .toDart;
    final fragment = hash.startsWith('#') ? hash.substring(1) : hash;
    if (!fragment.startsWith('/') || fragment.length > 24000) {
      return Uri(path: '/');
    }
    try {
      return Uri.parse(fragment);
    } catch (_) {
      return Uri(path: '/');
    }
  }

  String get page => currentRoute.pathSegments.firstOrNull ?? '';
  bool matchesRoute(Object route, Uri uri) => _contentRoutes[route] == uri;
  void enterContent(
    Object route,
    String page,
    Map<String, String> identity,
  ) async {
    final uri = Uri(path: '/$page', queryParameters: identity);
    if (BrowserContentRoute.parse(uri) == null) return;
    final current = currentRoute;
    if (sameBrowserContent(current, uri)) {
      _contentRoutes[route] = current;
      return;
    }
    _contentRoutes[route] = uri;
    await _ensureHistory();
    if (_contentRoutes[route] != uri || (route is Route && !route.isActive)) {
      return;
    }
    if (sameBrowserContent(currentRoute, uri)) {
      _contentRoutes[route] = currentRoute;
      return;
    }
    await SystemNavigator.routeInformationUpdated(uri: uri);
  }

  static bool _applyingHistory = false;
  void applyHistory(void Function() action) {
    final previous = _applyingHistory;
    _applyingHistory = true;
    try {
      action();
    } finally {
      _applyingHistory = previous;
    }
  }

  void leaveContent(Object route) => _contentRoutes.remove(route);
  static void popped(Route<dynamic> route) {
    final uri = _contentRoutes[route];
    if (!_applyingHistory &&
        uri != null &&
        uri == BrowserNavigation().currentRoute) {
      _window
          .getProperty<JSObject>('history'.toJS)
          .callMethod<JSAny?>('back'.toJS);
    }
  }

  bool get skipIntro {
    try {
      return page.isNotEmpty ||
          _window
                  .getProperty<JSObject>('sessionStorage'.toJS)
                  .callMethod<JSString?>('getItem'.toJS, 'najd.intro.seen'.toJS)
                  ?.toDart ==
              '1';
    } catch (_) {
      return page.isNotEmpty;
    }
  }

  bool requestInstall() {
    try {
      return _window.callMethod<JSBoolean>('najdRequestInstall'.toJS).toDart;
    } catch (_) {
      return false;
    }
  }

  void markIntroSeen() {
    try {
      _window
          .getProperty<JSObject>('sessionStorage'.toJS)
          .callMethod<JSAny?>('setItem'.toJS, 'najd.intro.seen'.toJS, '1'.toJS);
    } catch (_) {
      /* Browsing still works when session storage is unavailable. */
    }
  }

  void push(String page, {bool replace = false}) async {
    // Keep Flutter's history state consistent; raw pushState(null) makes the
    // engine treat an entry as foreign and restore its previous route.
    await _ensureHistory();
    await SystemNavigator.routeInformationUpdated(
      uri: Uri(path: '/$page'),
      replace: replace,
    );
  }

  void listen(void Function(String) onPage) {
    // Preserve incoming pairing and legacy work links until they are consumed.
    if (!Uri.base.queryParameters.containsKey('ref') &&
        !Uri.base.fragment.contains('najd_link=')) {
      _ensureHistory();
    }
    _listener = ((JSAny? event) {
      if (!_initializingHistory) onPage(page);
    }).toJS;
    _window.callMethod<JSAny?>(
      'addEventListener'.toJS,
      'popstate'.toJS,
      _listener,
    );
  }

  void dispose() {
    if (_listener != null) {
      _window.callMethod<JSAny?>(
        'removeEventListener'.toJS,
        'popstate'.toJS,
        _listener,
      );
    }
    _listener = null;
  }
}

class BrowserRouteObserver extends NavigatorObserver {
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    BrowserNavigation.popped(route);
    super.didPop(route, previousRoute);
  }
}
