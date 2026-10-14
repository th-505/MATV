import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/virtual_pointer.dart';

Widget pointerApp(VirtualPointerController controller, Widget child) =>
    MaterialApp(
      builder: (context, navigator) => VirtualPointerScope(
        controller: controller,
        child: navigator!,
      ),
      home: Scaffold(body: child),
    );

void main() {
  testWidgets('inactive pointer preserves focused D-pad and Select handling',
      (tester) async {
    final controller = VirtualPointerController();
    final focusNode = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focusNode.dispose);
    final seen = <LogicalKeyboardKey>[];
    await tester.pumpWidget(pointerApp(
      controller,
      Focus(
        autofocus: true,
        focusNode: focusNode,
        onKeyEvent: (node, event) {
          if (event is KeyDownEvent) seen.add(event.logicalKey);
          return KeyEventResult.handled;
        },
        child: const Text('normal navigation'),
      ),
    ));
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    expect(seen, [LogicalKeyboardKey.arrowRight, LogicalKeyboardKey.select]);
    expect(controller.enabled, isFalse);
    expect(find.byKey(const Key('virtual-pointer-cursor')), findsNothing);
  });

  testWidgets('F8 and remote menu toggle and restore the original focus',
      (tester) async {
    final controller = VirtualPointerController();
    final focusNode = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focusNode.dispose);
    await tester.pumpWidget(pointerApp(
      controller,
      TextButton(
        autofocus: true,
        focusNode: focusNode,
        onPressed: () {},
        child: const Text('focused'),
      ),
    ));
    await tester.pump();
    expect(focusNode.hasPrimaryFocus, isTrue);
    await tester.sendKeyEvent(LogicalKeyboardKey.f8);
    await tester.pump();
    expect(controller.enabled, isTrue);
    expect(focusNode.hasPrimaryFocus, isFalse);
    expect(find.byKey(const Key('virtual-pointer-cursor')), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.contextMenu);
    await tester.pump();
    expect(controller.enabled, isFalse);
    expect(focusNode.hasPrimaryFocus, isTrue);
    controller.setEnabled(true);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pump();
    expect(controller.enabled, isFalse);
    expect(focusNode.hasPrimaryFocus, isTrue);
  });

  testWidgets('Select clicks the pointed button through actual pointer events',
      (tester) async {
    final controller = VirtualPointerController(enabled: true);
    addTearDown(controller.dispose);
    var taps = 0;
    final events = <PointerEvent>[];
    await tester.pumpWidget(pointerApp(
      controller,
      Center(
        child: Listener(
          onPointerDown: events.add,
          onPointerUp: events.add,
          child: ElevatedButton(
            key: const Key('pointer-target'),
            onPressed: () => taps++,
            child: const Text('pointed target'),
          ),
        ),
      ),
    ));
    await tester.pump();
    controller
        .moveTo(tester.getCenter(find.byKey(const Key('pointer-target'))));
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    await tester.pump();
    expect(taps, 1);
    expect(events, [isA<PointerDownEvent>(), isA<PointerUpEvent>()]);
    expect(
        events.every((event) => event.kind == PointerDeviceKind.mouse), isTrue);
    expect(events[0].pointer, events[1].pointer);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(taps, 2);
  });

  testWidgets('held arrows accelerate, clamp to viewport, and stop on release',
      (tester) async {
    final controller = VirtualPointerController(enabled: true);
    addTearDown(controller.dispose);
    tester.view.physicalSize = const Size(1200, 600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(pointerApp(controller, const SizedBox.expand()));
    await tester.pump();
    controller.moveTo(const Offset(30, 200));
    await tester.sendKeyDownEvent(LogicalKeyboardKey.arrowRight);
    final start = controller.position.dx;
    for (var frame = 0; frame < 8; frame++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    final earlyDistance = controller.position.dx - start;
    for (var frame = 0; frame < 40; frame++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    final acceleratedStart = controller.position.dx;
    for (var frame = 0; frame < 8; frame++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(
        controller.position.dx - acceleratedStart, greaterThan(earlyDistance));
    for (var frame = 0; frame < 120; frame++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(controller.position, const Offset(1199, 200));
    await tester.sendKeyUpEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump(const Duration(seconds: 1));
    expect(controller.position, const Offset(1199, 200));
    controller.moveTo(const Offset(-900, 900));
    expect(controller.position, const Offset(0, 599));
  });

  testWidgets('disabling while a key is held stops motion and restores keys',
      (tester) async {
    final controller = VirtualPointerController();
    final focusNode = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focusNode.dispose);
    var selections = 0;
    await tester.pumpWidget(pointerApp(
      controller,
      Focus(
        focusNode: focusNode,
        autofocus: true,
        onKeyEvent: (node, event) {
          if (event is KeyDownEvent &&
              event.logicalKey == LogicalKeyboardKey.select) {
            selections++;
          }
          return KeyEventResult.handled;
        },
        child: const SizedBox.expand(),
      ),
    ));
    await tester.pump();
    controller.setEnabled(true);
    await tester.pump();
    await tester.sendKeyDownEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump(const Duration(milliseconds: 64));
    controller.setEnabled(false);
    await tester.pump();
    final stopped = controller.position;
    await tester.sendKeyUpEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump(const Duration(milliseconds: 200));
    expect(controller.position, stopped);
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    expect(selections, 1);
  });

  testWidgets('pointer clicks a pushed route and cleans up after disposal',
      (tester) async {
    final controller = VirtualPointerController();
    final focusNode = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focusNode.dispose);
    var routeTaps = 0;
    await tester.pumpWidget(pointerApp(
      controller,
      Builder(
        builder: (context) => TextButton(
          autofocus: true,
          focusNode: focusNode,
          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  key: const Key('route-target'),
                  onPressed: () => routeTaps++,
                  child: const Text('route target'),
                ),
              ),
            ),
          )),
          child: const Text('open route'),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open route'));
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.contextMenu);
    await tester.pump();
    controller.moveTo(tester.getCenter(find.byKey(const Key('route-target'))));
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    await tester.pump();
    expect(routeTaps, 1);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pumpWidget(const MaterialApp(home: SizedBox.expand()));
    await tester.sendKeyUpEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.sendKeyEvent(LogicalKeyboardKey.f8);
    expect(controller.enabled, isTrue); // The disposed scope no longer toggles.
    expect(tester.takeException(), isNull);
  });
}
