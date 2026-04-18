import 'dart:io';
import 'package:args/command_runner.dart';
import 'package:path/path.dart' as p;

class _CheckResult {
  _CheckResult(this.ok, this.label, [this.detail]);
  final bool ok;
  final String label;
  final String? detail;
}

class DoctorCommand extends Command<int> {
  DoctorCommand() {
    argParser.addOption(
      'path',
      abbr: 'p',
      defaultsTo: '.',
      help: 'Target Flutter project path (defaults to current directory).',
    );
  }

  @override
  String get name => 'doctor';

  @override
  String get description =>
      'Diagnose a Roveflow install: deps, main.dart wiring, MCP config, skill presence.';

  @override
  Future<int> run() async {
    final target = Directory(argResults!['path'] as String).absolute;

    // Short-circuit: if target isn't a Flutter project, there's nothing to diagnose.
    final pubspec = File(p.join(target.path, 'pubspec.yaml'));
    if (!pubspec.existsSync() ||
        !pubspec.readAsStringSync().contains('sdk: flutter')) {
      stderr.writeln(
        'roveflow doctor: ${target.path} does not look like a Flutter project '
        '(no pubspec.yaml with a Flutter dependency).',
      );
      return 1;
    }

    final results = <_CheckResult>[
      _checkPubspecDep(target),
      _checkMainWiring(target),
      _checkMcpConfig(target),
      _checkSkillInstalled(target),
    ];

    stdout.writeln('roveflow doctor — ${target.path}');
    for (final r in results) {
      final tag = r.ok ? '[ok]' : '[fail]';
      stdout.writeln('  $tag  ${r.label}');
      if (!r.ok && r.detail != null) {
        stdout.writeln('         ${r.detail}');
      }
    }
    stdout.writeln('');

    final failed = results.where((r) => !r.ok).length;
    if (failed == 0) {
      stdout.writeln('All checks passed.');
      return 0;
    }
    stdout.writeln('$failed check${failed == 1 ? '' : 's'} failed.');
    return 1;
  }

  _CheckResult _checkPubspecDep(Directory target) {
    final content = File(p.join(target.path, 'pubspec.yaml')).readAsStringSync();
    final ok = RegExp(r'^\s+mcp_toolkit:', multiLine: true).hasMatch(content);
    return _CheckResult(
      ok,
      'pubspec.yaml declares mcp_toolkit',
      ok ? null : 'Add a `mcp_toolkit: ^0.4.0` line under `dependencies:`.',
    );
  }

  _CheckResult _checkMainWiring(Directory target) {
    final mainFile = File(p.join(target.path, 'lib/main.dart'));
    if (!mainFile.existsSync()) {
      return _CheckResult(false, 'main.dart calls registerMcpInteractionTools',
          'lib/main.dart not found.');
    }
    final content = mainFile.readAsStringSync();
    final ok = content.contains('registerMcpInteractionTools(');
    return _CheckResult(
      ok,
      'main.dart calls registerMcpInteractionTools',
      ok
          ? null
          : 'Add `await registerMcpInteractionTools();` inside your `kDebugMode` block.',
    );
  }

  _CheckResult _checkMcpConfig(Directory target) {
    final f = File(p.join(target.path, '.mcp.json'));
    if (!f.existsSync()) {
      return _CheckResult(false, '.mcp.json present and resolves',
          '.mcp.json not found. Run `roveflow init` or merge the snippet manually.');
    }
    final content = f.readAsStringSync();
    if (!content.contains('"flutter-inspector"')) {
      return _CheckResult(false, '.mcp.json present and resolves',
          '.mcp.json does not declare a flutter-inspector server.');
    }
    if (RegExp(r'"command"\s*:\s*"[^"]*<').hasMatch(content)) {
      return _CheckResult(false, '.mcp.json present and resolves',
          'flutter-inspector `command` still contains a `<placeholder>`. '
          r'Use `${ROVEFLOW_FLUTTER_INSPECTOR}` or an absolute path.');
    }
    return _CheckResult(true, '.mcp.json present and resolves');
  }

  _CheckResult _checkSkillInstalled(Directory target) {
    final skill = File(p.join(target.path, '.claude/skills/roveflow/SKILL.md'));
    final ok = skill.existsSync();
    return _CheckResult(
      ok,
      'skill installed at .claude/skills/roveflow',
      ok ? null : 'Run `roveflow init` to materialise the skill.',
    );
  }
}
