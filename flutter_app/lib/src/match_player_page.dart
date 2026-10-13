import 'package:flutter/material.dart';
import 'api_client.dart';
import 'library_store.dart';
import 'models.dart';
import 'player_page.dart';
import 'universal_player.dart';

/// Live events use the same renderer, viewport, gestures and source selector.
class MatchPlayerPage extends StatelessWidget {
  const MatchPlayerPage(
      {super.key,
      required this.api,
      required this.match,
      required this.store,
      this.playerFactory});
  final MitvApi api;
  final MatchItem match;
  final LocalLibraryStore store;
  final UniversalPlayer Function(Uri, String, Map<String, String>, bool)?
      playerFactory;
  @override
  Widget build(BuildContext context) => PlayerPage(
      api: api,
      store: store,
      item: MediaItem(
          id: match.ref,
          title: '${match.home} × ${match.away}',
          poster: '',
          type: 'live',
          ref: match.ref),
      title: '${match.home} × ${match.away}',
      sourceRef: match.ref,
      isLive: true,
      playerFactory: playerFactory);
}
