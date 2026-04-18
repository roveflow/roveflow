@Tags(['e2e'])
library;

import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

void main() {
  test('roveflow init produces a Flutter project that flutter analyze accepts', () async {
    final tempDir = await Directory.systemTemp.createTemp('roveflow_e2e_');
    addTearDown(() async {
      if (tempDir.existsSync()) await tempDir.delete(recursive: true);
    });

    // Scaffold a fresh Flutter app
    final flutter = await Process.run('flutter', [
      'create', '--org', 'test.roveflow', '--project-name', 'rf_e2e',
      '--platforms=ios', tempDir.path,
    ]);
    expect(flutter.exitCode, 0,
        reason: 'flutter create failed: ${flutter.stderr}');

    // Run the real CLI
    final pkgRoot = p.absolute(Directory.current.path);
    final init = await Process.run('dart', [
      'run', p.join(pkgRoot, 'bin', 'roveflow.dart'), 'init',
      '--path', tempDir.path,
    ]);
    expect(init.exitCode, 0,
        reason: 'roveflow init failed: ${init.stderr}');

    // Create the navigation_util.dart stub that mcp_interaction_tools.dart imports.
    // In a real project the developer provides their own; in the e2e test we
    // create a minimal stub so flutter analyze has a valid target to resolve.
    final navUtil = File(
      p.join(tempDir.path, 'lib/core/general_helpers/utils/navigation_util.dart'),
    );
    navUtil.parent.createSync(recursive: true);
    await navUtil.writeAsString(
      "import 'package:flutter/widgets.dart';\n"
      "final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();\n"
      "class _Navigate { const _Navigate(); void pop() { rootNavigatorKey.currentState?.pop(); } }\n"
      "const navigate = _Navigate();\n",
    );

    // Wire main.dart with the registerMcpInteractionTools block.
    final main = File(p.join(tempDir.path, 'lib/main.dart'));
    var src = await main.readAsString();
    src = src.replaceFirst(
      'void main() {',
      "import 'package:flutter/foundation.dart';\n"
      "import 'package:rf_e2e/core/mcp/mcp_interaction_tools.dart';\n"
      "void main() async {\n"
      "  WidgetsFlutterBinding.ensureInitialized();\n"
      "  if (kDebugMode) { await registerMcpInteractionTools(); }",
    );
    await main.writeAsString(src);

    // Add mcp_toolkit dep so the bundled import can resolve.
    final pubspec = File(p.join(tempDir.path, 'pubspec.yaml'));
    var ps = await pubspec.readAsString();
    ps = ps.replaceFirst(
      '  cupertino_icons:',
      '  mcp_toolkit: ^0.4.0\n  cupertino_icons:',
    );
    await pubspec.writeAsString(ps);

    // pub get
    final pubGet = await Process.run('flutter', ['pub', 'get'],
        workingDirectory: tempDir.path);
    expect(pubGet.exitCode, 0,
        reason: 'flutter pub get failed: ${pubGet.stderr}');

    // analyze — tolerate info-level lints, fail on errors
    final analyze = await Process.run('flutter', ['analyze'],
        workingDirectory: tempDir.path);
    final analyzeOutput = '${analyze.stdout}\n${analyze.stderr}';
    expect(analyzeOutput, isNot(contains(' error •')),
        reason: 'analyze reported errors:\n$analyzeOutput');
  }, timeout: Timeout(Duration(minutes: 4)));
}
