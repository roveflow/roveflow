import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:roveflow/src/cli_runner.dart';
import 'package:test/test.dart';

void main() {
  late Directory tempDir;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('roveflow_init_');
    await File(p.join(tempDir.path, 'pubspec.yaml')).writeAsString('''
name: fake_app
environment:
  sdk: ^3.3.0
dependencies:
  flutter:
    sdk: flutter
''');
  });

  tearDown(() async {
    if (tempDir.existsSync()) {
      await tempDir.delete(recursive: true);
    }
  });

  test('init creates expected directories in a Flutter project', () async {
    final code = await CliRunner().run(['init', '--path', tempDir.path]);
    expect(code, 0);
    expect(Directory(p.join(tempDir.path, '.claude/skills/roveflow')).existsSync(), isTrue);
    expect(Directory(p.join(tempDir.path, '.claude/commands')).existsSync(), isTrue);
    expect(Directory(p.join(tempDir.path, '.claude/agents')).existsSync(), isTrue);
    expect(Directory(p.join(tempDir.path, 'docs/roveflow/runs')).existsSync(), isTrue);
    expect(File(p.join(tempDir.path, 'docs/roveflow/scenarios.md')).existsSync(), isTrue);

    expect(File(p.join(tempDir.path, '.claude/skills/roveflow/SKILL.md')).existsSync(), isTrue);
    expect(File(p.join(tempDir.path, '.claude/commands/roveflow.md')).existsSync(), isTrue);
    expect(File(p.join(tempDir.path, '.claude/agents/roveflow-runner.md')).existsSync(), isTrue);
    expect(File(p.join(tempDir.path, 'lib/core/mcp/mcp_interaction_tools.dart')).existsSync(), isTrue);
    expect(File(p.join(tempDir.path, '.mcp.json')).existsSync(), isTrue);

    final mcp = File(p.join(tempDir.path, '.mcp.json')).readAsStringSync();
    expect(mcp, isNot(contains('<absolute path')));
    expect(mcp, contains(r'${ROVEFLOW_FLUTTER_INSPECTOR}'));

    // scenarios.md should no longer be the placeholder
    final scenarios = File(p.join(tempDir.path, 'docs/roveflow/scenarios.md')).readAsStringSync();
    expect(scenarios, contains('cold-setup'));

    final tools = File(p.join(tempDir.path, 'lib/core/mcp/mcp_interaction_tools.dart')).readAsStringSync();
    expect(tools, isNot(contains('<your_app>')), reason: 'placeholder must be substituted');
    expect(tools, contains('package:fake_app/core/general_helpers/utils/navigation_util.dart'));
  });

  test('init exits non-zero on a non-Flutter project', () async {
    final nonFlutter = await Directory.systemTemp.createTemp('not_flutter_');
    addTearDown(() async {
      if (nonFlutter.existsSync()) await nonFlutter.delete(recursive: true);
    });
    await File(p.join(nonFlutter.path, 'pubspec.yaml')).writeAsString('''
name: dart_only
environment:
  sdk: ^3.3.0
''');
    final code = await CliRunner().run(['init', '--path', nonFlutter.path]);
    expect(code, isNot(0));
  });

  test('re-init without --force preserves files modified by user', () async {
    // First init
    expect(await CliRunner().run(['init', '--path', tempDir.path]), 0);

    // User edits scenarios.md (one of the materialised files)
    final scenarios = File(p.join(tempDir.path, 'docs/roveflow/scenarios.md'));
    await scenarios.writeAsString('# my custom scenarios\n');

    // Second init — should NOT clobber the user edit.
    expect(await CliRunner().run(['init', '--path', tempDir.path]), 0);
    expect(await scenarios.readAsString(), equals('# my custom scenarios\n'));
  });

  test('re-init with --force overwrites user-modified files', () async {
    expect(await CliRunner().run(['init', '--path', tempDir.path]), 0);

    final scenarios = File(p.join(tempDir.path, 'docs/roveflow/scenarios.md'));
    await scenarios.writeAsString('# my custom scenarios\n');

    expect(await CliRunner().run(['init', '--path', tempDir.path, '--force']), 0);
    expect(await scenarios.readAsString(), isNot(equals('# my custom scenarios\n')));
    expect(await scenarios.readAsString(), contains('cold-setup'));
  });
}
