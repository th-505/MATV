class NajdPipEvent {
  const NajdPipEvent({
    required this.active,
    this.position,
    this.duration,
    this.playing,
    this.command,
  });
  final bool active;
  final Duration? position, duration;
  final bool? playing;
  final String? command;
}
