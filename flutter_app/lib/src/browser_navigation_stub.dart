import 'package:flutter/widgets.dart';

class BrowserNavigation {
  Future<void> get ready async {}
  Uri get currentRoute => Uri(path: '/');
  bool matchesRoute(Object route, Uri uri) => false;
  void enterContent(Object route, String page, Map<String, String> identity) {}
  void leaveContent(Object route) {}
  void applyHistory(void Function() action) => action();
  String get page => '';
  bool get skipIntro => false;
  bool requestInstall() => false;
  void markIntroSeen() {}
  void push(String page, {bool replace = false}) {}
  void listen(void Function(String) onPage) {}
  void dispose() {}
}

class BrowserRouteObserver extends NavigatorObserver {}
