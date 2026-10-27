import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

/// Controls MITV's pointer inside its Flutter surface, rather than an OS mouse.
///
/// The TV shell owns and disposes this controller. It starts disabled so normal
/// D-pad focus navigation remains the default. A settings switch can call
/// [setEnabled]; a connected scope also supports F8 and the remote menu key.
class VirtualPointerController extends ChangeNotifier {
  // Keep the public parameter name while storing state in a private field.
  // ignore: prefer_initializing_formals
  VirtualPointerController({bool enabled = false}) : _enabled = enabled;

  bool _enabled;
  Offset _position = Offset.zero;
  bool _hasPosition = false;
  Size _bounds = Size.zero;

  bool get enabled => _enabled;
  Offset get position => _position;

  void setEnabled(bool value) {
    if (_enabled == value) return;
    _enabled = value;
    notifyListeners();
  }

  void toggle() => setEnabled(!_enabled);

  /// Moves the pointer in logical pixels relative to the scope's top-left.
  /// Positions are clamped to the current viewport, including after resizing.
  void moveTo(Offset value) {
    if (!value.dx.isFinite || !value.dy.isFinite) return;
    _hasPosition = true;
    final next = _clamp(value);
    if (_position == next) return;
    _position = next;
    notifyListeners();
  }

  Offset _clamp(Offset value) {
    if (_bounds.isEmpty) return value;
    return Offset(
      value.dx.clamp(0.0, math.max(0.0, _bounds.width - 1.0)),
      value.dy.clamp(0.0, math.max(0.0, _bounds.height - 1.0)),
    );
  }

  // Called during the scope's layout; that build already paints the new value.
  // It must not notify listeners while a parent LayoutBuilder is building.
  void _setBounds(Size value) {
    _bounds = value;
    if (!_hasPosition && !value.isEmpty) {
      _position = Offset(value.width / 2, value.height / 2);
      _hasPosition = true;
    } else {
      _position = _clamp(_position);
    }
  }
}

/// A TV-only overlay for navigating otherwise awkward Flutter controls.
///
/// Wrap the Navigator (for example in MaterialApp.builder) so the pointer also
/// covers pushed player/details routes. This does not control platform views,
/// another app, or embedded web-page internals. Disabled scopes leave all normal
/// navigation and activation keys untouched, except the explicit toggle keys.
class VirtualPointerScope extends StatefulWidget {
  const VirtualPointerScope({
    super.key,
    required this.controller,
    required this.child,
  });

  final VirtualPointerController controller;
  final Widget child;

  @override
  State<VirtualPointerScope> createState() => _VirtualPointerScopeState();
}

class _VirtualPointerScopeState extends State<VirtualPointerScope>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  static int _nextDevice = 1000000;
  static int _nextPointer = 1000000;
  final GlobalKey _surfaceKey = GlobalKey();
  final FocusNode _keyboardFocus = FocusNode(
    debugLabel: 'MITV virtual pointer',
    skipTraversal: true,
  );
  final Set<LogicalKeyboardKey> _held = <LogicalKeyboardKey>{};
  final Stopwatch _clock = Stopwatch()..start();
  late final Ticker _ticker;
  late final int _device;
  FocusNode? _previousFocus;
  Duration _previousTick = Duration.zero;
  Duration _holdStarted = Duration.zero;
  Offset? _globalPosition;
  int _viewId = 0;
  bool _active = false;
  bool _pointerAdded = false;

  @override
  void initState() {
    super.initState();
    _device = _nextDevice++;
    _ticker = createTicker(_onTick);
    widget.controller.addListener(_onControllerChanged);
    WidgetsBinding.instance.addObserver(this);
    FocusManager.instance.addEarlyKeyEventHandler(_onKeyEvent);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _onControllerChanged();
    });
  }

  @override
  void didUpdateWidget(covariant VirtualPointerScope oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller == widget.controller) return;
    oldWidget.controller.removeListener(_onControllerChanged);
    _deactivatePointer();
    widget.controller.addListener(_onControllerChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _onControllerChanged();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      _stopMotion();
      _removeMouse();
    } else if (_active) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _active) _sendHover();
      });
    }
  }

  void _onControllerChanged() {
    if (!mounted) return;
    if (widget.controller.enabled && !_active) {
      _active = true;
      _previousFocus = FocusManager.instance.primaryFocus;
      _keyboardFocus.requestFocus();
      _sendHover();
    } else if (!widget.controller.enabled && _active) {
      _deactivatePointer();
    } else if (_active) {
      _sendHover();
    }
    setState(() {});
  }

  void _deactivatePointer() {
    _active = false;
    _stopMotion();
    _removeMouse();
    final previous = _previousFocus;
    _previousFocus = null;
    if (previous?.context != null && previous!.canRequestFocus) {
      previous.requestFocus();
    } else if (_keyboardFocus.hasPrimaryFocus) {
      _keyboardFocus.unfocus();
    }
  }

  void _stopMotion() {
    _held.clear();
    _ticker.stop();
    _previousTick = Duration.zero;
    _holdStarted = Duration.zero;
  }

  static bool _isDirection(LogicalKeyboardKey key) =>
      key == LogicalKeyboardKey.arrowUp ||
      key == LogicalKeyboardKey.arrowDown ||
      key == LogicalKeyboardKey.arrowLeft ||
      key == LogicalKeyboardKey.arrowRight;

  KeyEventResult _onKeyEvent(KeyEvent event) {
    if (!mounted || !TickerMode.valuesOf(context).enabled) {
      return KeyEventResult.ignored;
    }
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.f8 || key == LogicalKeyboardKey.contextMenu) {
      if (event is KeyDownEvent) widget.controller.toggle();
      return KeyEventResult.handled;
    }
    if (!_active) return KeyEventResult.ignored;
    if (key == LogicalKeyboardKey.escape) {
      if (event is KeyDownEvent) widget.controller.setEnabled(false);
      return KeyEventResult.handled;
    }
    if (_isDirection(key)) {
      if (event is KeyUpEvent) {
        _held.remove(key);
        if (_held.isEmpty) _stopMotion();
      } else if (_held.add(key)) {
        // A short press moves precisely; holding accelerates continuously even
        // on remotes that deliver few or irregular repeat events.
        widget.controller.moveTo(widget.controller.position + _direction() * 4);
        if (!_ticker.isActive) {
          _previousTick = Duration.zero;
          _holdStarted = Duration.zero;
          _ticker.start();
        }
      }
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.select ||
        key == LogicalKeyboardKey.enter ||
        key == LogicalKeyboardKey.numpadEnter) {
      if (event is KeyDownEvent) _click();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Offset _direction() {
    final vector = Offset(
      (_held.contains(LogicalKeyboardKey.arrowRight) ? 1.0 : 0.0) -
          (_held.contains(LogicalKeyboardKey.arrowLeft) ? 1.0 : 0.0),
      (_held.contains(LogicalKeyboardKey.arrowDown) ? 1.0 : 0.0) -
          (_held.contains(LogicalKeyboardKey.arrowUp) ? 1.0 : 0.0),
    );
    return vector.distance == 0 ? Offset.zero : vector / vector.distance;
  }

  void _onTick(Duration elapsed) {
    if (!_active || _held.isEmpty) {
      _stopMotion();
      return;
    }
    final delta = elapsed - _previousTick;
    _previousTick = elapsed;
    final seconds = (delta.inMicroseconds / Duration.microsecondsPerSecond)
        .clamp(0.0, 0.05);
    final heldSeconds = (elapsed - _holdStarted).inMicroseconds /
        Duration.microsecondsPerSecond;
    final acceleration = (heldSeconds / 0.8).clamp(0.0, 1.0);
    final speed = 110 + 590 * acceleration;
    widget.controller.moveTo(
      widget.controller.position + _direction() * speed * seconds,
    );
  }

  Offset? _eventPosition() {
    final box = _surfaceKey.currentContext?.findRenderObject();
    if (box is! RenderBox ||
        !box.attached ||
        !box.hasSize ||
        box.size.isEmpty) {
      return null;
    }
    _viewId = View.of(context).viewId;
    return box.localToGlobal(widget.controller.position);
  }

  void _sendHover() {
    final position = _eventPosition();
    if (position == null) return;
    final binding = GestureBinding.instance;
    if (!_pointerAdded) {
      _pointerAdded = true;
      binding.handlePointerEvent(PointerAddedEvent(
        position: position,
        timeStamp: _clock.elapsed,
        kind: PointerDeviceKind.mouse,
        device: _device,
        viewId: _viewId,
      ));
    }
    final delta = position - (_globalPosition ?? position);
    _globalPosition = position;
    binding.handlePointerEvent(PointerHoverEvent(
      position: position,
      delta: delta,
      timeStamp: _clock.elapsed,
      kind: PointerDeviceKind.mouse,
      device: _device,
      viewId: _viewId,
    ));
  }

  void _click() {
    final position = _eventPosition();
    if (position == null) return;
    _sendHover();
    final pointer = _nextPointer++;
    final binding = GestureBinding.instance;
    binding.handlePointerEvent(PointerDownEvent(
      pointer: pointer,
      position: position,
      timeStamp: _clock.elapsed,
      kind: PointerDeviceKind.mouse,
      device: _device,
      buttons: kPrimaryMouseButton,
      viewId: _viewId,
    ));
    binding.handlePointerEvent(PointerUpEvent(
      pointer: pointer,
      position: position,
      timeStamp: _clock.elapsed,
      kind: PointerDeviceKind.mouse,
      device: _device,
      viewId: _viewId,
    ));
  }

  void _removeMouse() {
    if (!_pointerAdded) return;
    final event = PointerRemovedEvent(
      position: _globalPosition ?? Offset.zero,
      timeStamp: _clock.elapsed,
      kind: PointerDeviceKind.mouse,
      device: _device,
      viewId: _viewId,
    );
    _pointerAdded = false;
    _globalPosition = null;
    // Unmount runs while the widget tree is locked. Removing a hovering mouse
    // immediately would invoke an old button's onExit/setState during that
    // lock. Deliver the final event after layout/disposal has completed.
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        GestureBinding.instance.handlePointerEvent(event);
      });
    } else {
      GestureBinding.instance.handlePointerEvent(event);
    }
  }

  @override
  void dispose() {
    FocusManager.instance.removeEarlyKeyEventHandler(_onKeyEvent);
    WidgetsBinding.instance.removeObserver(this);
    widget.controller.removeListener(_onControllerChanged);
    _deactivatePointer();
    _ticker.dispose();
    _keyboardFocus.dispose();
    _clock.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Focus(
        focusNode: _keyboardFocus,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final size = constraints.biggest;
            assert(
                size.isFinite, 'VirtualPointerScope needs a finite viewport');
            widget.controller._setBounds(size);
            final position = widget.controller.position;
            return Stack(
              key: _surfaceKey,
              fit: StackFit.expand,
              clipBehavior: Clip.hardEdge,
              children: [
                widget.child,
                if (widget.controller.enabled)
                  Positioned(
                    left: position.dx - 12,
                    top: position.dy - 12,
                    width: 24,
                    height: 24,
                    child: const IgnorePointer(
                      child: ExcludeSemantics(
                        child: DecoratedBox(
                          key: Key('virtual-pointer-cursor'),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Color(0x99E50914),
                            border: Border.fromBorderSide(
                              BorderSide(color: Colors.white, width: 2),
                            ),
                            boxShadow: [
                              BoxShadow(color: Colors.black54, blurRadius: 6),
                            ],
                          ),
                          child: Center(
                            child:
                                Icon(Icons.add, size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      );
}
