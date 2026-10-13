import 'dart:io';
import 'package:flutter/material.dart';
import 'api_client.dart';
import 'library_store.dart';
import 'models.dart';
import 'player_page.dart';

/// Downloads share the cinema/live surface and renderer without network resolution.
class LocalDownloadPlayerPage extends StatefulWidget {
  const LocalDownloadPlayerPage(
      {super.key, required this.file, required this.title});
  final File file;
  final String title;
  @override
  State<LocalDownloadPlayerPage> createState() =>
      _LocalDownloadPlayerPageState();
}

class _LocalDownloadPlayerPageState extends State<LocalDownloadPlayerPage> {
  final api = MitvApi();
  late final Future<LocalLibraryStore> library = _prepare();
  Future<LocalLibraryStore> _prepare() async {
    if (!await widget.file.exists() || await widget.file.length() == 0) {
      throw StateError('LOCAL_DOWNLOAD_MISSING');
    }
    return LocalLibraryStore.create();
  }

  @override
  void dispose() {
    api.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<LocalLibraryStore>(
      future: library,
      builder: (context, snapshot) {
        if (snapshot.hasData) {
          return PlayerPage(
              api: api,
              store: snapshot.data!,
              item: MediaItem(
                  id: widget.file.uri.pathSegments.last,
                  title: widget.title,
                  poster: '',
                  type: 'download',
                  ref: 'download:${widget.file.uri.pathSegments.last}'),
              title: widget.title,
              localFileUri: widget.file.uri,
              mediaType: widget.file.path.split('.').last.toLowerCase(),
              persistProgress: false);
        }
        return Scaffold(
            appBar: AppBar(title: Text(widget.title)),
            body: Center(
                child: snapshot.hasError
                    ? const Text('الملف المحمّل غير متاح أو فارغ.')
                    : const CircularProgressIndicator()));
      });
}
