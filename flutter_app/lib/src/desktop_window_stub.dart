class DesktopWindowBridge {
  bool get miniSupported => false;
  Future<bool> enterMini(double width, double height) async => false;
  Future<void> leaveMini() async {}
  Future<bool> enter() async => false;
  Future<bool> setFullscreen(bool value) async => false;
  Future<void> leave() async {}
}
