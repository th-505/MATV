import 'dart:io';

bool get cloudRuntimeIsTest => Platform.environment.containsKey('FLUTTER_TEST');
