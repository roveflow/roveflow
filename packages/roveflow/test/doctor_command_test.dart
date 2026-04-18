import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:roveflow/src/cli_runner.dart';
import 'package:test/test.dart';

void main() {
  late Directory temp;

  setUp(() async {
    temp = await Directory.systemTemp.createTemp('rf_doctor_');
  });

  tearDown(() async {
    if (temp.existsSync()) await temp.delete(recursive: true);
  });

  Future<void> scaffoldCleanInstall() async {
    await File(p.join(temp.path, 'pubspec.yaml')).writeAsString('''
name: app
environment:
  sdk: ^3.3.0
dependencies:
  flutter:
    sdk: flutter
  mcp_toolkit: ^0.4.0
''');
    await Directory(p.join(temp.path, 'lib')).create(recursive: true);
    await File(p.join(temp.path, 'lib/main.dart')).writeAsString('''
void main() async {
  await registerMcpInteractionTools();
}
''');
    await File(p.join(temp.path, '.mcp.json')).writeAsString('''
{"mcpServers":{"flutter-inspector":{"command":"/usr/local/bin/fi"}}}
''');
    final skillDir = Directory(p.join(temp.path, '.claude/skills/roveflow'));
    await skillDir.create(recursive: true);
    await File(p.join(skillDir.path, 'SKILL.md')).writeAsString('# skill\n');
  }

  test('doctor exits 0 on a clean install', () async {
    await scaffoldCleanInstall();
    final code = await CliRunner().run(['doctor', '--path', temp.path]);
    expect(code, 0);
  });

  test('doctor fails when pubspec lacks mcp_toolkit', () async {
    await scaffoldCleanInstall();
    final pubspec = File(p.join(temp.path, 'pubspec.yaml'));
    await pubspec.writeAsString(
      (await pubspec.readAsString())
          .replaceAll(RegExp(r'^\s+mcp_toolkit:.*\n', multiLine: true), ''),
    );
    final code = await CliRunner().run(['doctor', '--path', temp.path]);
    expect(code, isNot(0));
  });

  test('doctor fails when main.dart omits registerMcpInteractionTools', () async {
    await scaffoldCleanInstall();
    await File(p.join(temp.path, 'lib/main.dart')).writeAsString('void main() {}\n');
    final code = await CliRunner().run(['doctor', '--path', temp.path]);
    expect(code, isNot(0));
  });

  test('doctor fails when .mcp.json has a placeholder', () async {
    await scaffoldCleanInstall();
    await File(p.join(temp.path, '.mcp.json')).writeAsString(
      '{"mcpServers":{"flutter-inspector":{"command":"<absolute path...>"}}}\n',
    );
    final code = await CliRunner().run(['doctor', '--path', temp.path]);
    expect(code, isNot(0));
  });

  test('doctor fails when skill directory is missing', () async {
    await scaffoldCleanInstall();
    await Directory(p.join(temp.path, '.claude/skills/roveflow'))
        .delete(recursive: true);
    final code = await CliRunner().run(['doctor', '--path', temp.path]);
    expect(code, isNot(0));
  });

  test('doctor short-circuits on non-Flutter projects', () async {
    await File(p.join(temp.path, 'pubspec.yaml')).writeAsString('''
name: dart_only
environment:
  sdk: ^3.3.0
''');
    final code = await CliRunner().run(['doctor', '--path', temp.path]);
    expect(code, isNot(0));
  });
}
