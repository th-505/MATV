import 'dart:async';
import 'package:media_kit/media_kit.dart' as mk;

/// A transport double underneath the real media_kit Player/Media facade.
/// Adapter and page tests therefore inspect the actual libmpv input contract.
class RecordingMediaKitPlatform extends mk.PlatformPlayer {
  RecordingMediaKitPlatform({this.failOpen = false})
      : super(configuration: const mk.PlayerConfiguration());

  final bool failOpen;
  final opened = <mk.Media>[];
  final seeks = <Duration>[];
  final volumes = <double>[];
  final rates = <double>[];
  int disposalCount = 0;
  int playCount = 0;
  int pauseCount = 0;

  @override
  Future<void> open(mk.Playable playable, {bool play = true}) async {
    opened.add(playable as mk.Media);
    if (failOpen) throw StateError('403 fixture');
    state = mk.PlayerState(
        duration: const Duration(minutes: 10), width: 1920, height: 1080);
    durationController.add(state.duration);
    widthController.add(state.width);
    heightController.add(state.height);
  }

  @override
  Future<void> play() async {
    playCount++;
    playingController.add(true);
  }

  @override
  Future<void> pause() async {
    pauseCount++;
    playingController.add(false);
  }

  @override
  Future<void> seek(Duration position) async {
    seeks.add(position);
    positionController.add(position);
  }

  @override
  Future<void> setRate(double rate) async => rates.add(rate);
  @override
  Future<void> setVolume(double volume) async => volumes.add(volume);
  @override
  Future<void> dispose() async {
    disposalCount++;
    await super.dispose();
  }

  void emitPosition(Duration position) => positionController.add(position);

  void emitError(String error) => errorController.add(error);
}
