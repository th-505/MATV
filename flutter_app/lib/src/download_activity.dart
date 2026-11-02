import 'package:flutter/foundation.dart';

class NajdDownloadJob {
  const NajdDownloadJob({
    required this.id,
    required this.title,
    this.received = 0,
    this.total,
    this.failed = false,
    this.cancel,
    this.retry,
  });
  final String id, title;
  final int received;
  final int? total;
  final bool failed;
  final VoidCallback? cancel;
  final Future<void> Function()? retry;
  double? get fraction =>
      total == null || total! <= 0 ? null : (received / total!).clamp(0, 1);
}

class NajdDownloadActivity extends ValueNotifier<List<NajdDownloadJob>> {
  NajdDownloadActivity._() : super(const []);
  static final instance = NajdDownloadActivity._();
  void put(NajdDownloadJob job) =>
      value = [...value.where((e) => e.id != job.id), job];
  void remove(String id) => value = value.where((e) => e.id != id).toList();
}
