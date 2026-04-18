import 'dart:io';
import 'package:args/command_runner.dart';
import 'package:path/path.dart' as p;
import '../bundled_templates.g.dart';

class InitCommand extends Command<int> {
  InitCommand() {
    argParser.addOption(
      'path',
      abbr: 'p',
      defaultsTo: '.',
      help: 'Target Flutter project path (defaults to current directory).',
    );
    argParser.addFlag(
      'force',
      abbr: 'f',
      defaultsTo: false,
      help: 'Overwrite locally modified files with the bundled version.',
    );
  }

  @override
  String get name => 'init';

  @override
  String get description =>
      'Install Roveflow into a Flutter project (zero source-code changes).';

  @override
  Future<int> run() async {
    final target = Directory(argResults!['path'] as String).absolute;
    final force = argResults!['force'] as bool;

    if (!_isFlutterProject(target)) {
      stderr.writeln(
        'roveflow init: ${target.path} does not look like a Flutter project '
        '(no pubspec.yaml with a Flutter dependency).',
      );
      return 1;
    }

    final created = <String>[];
    final skipped = <String>[];

    // Top-level directories
    for (final rel in const [
      '.claude/skills/roveflow',
      '.claude/commands',
      '.claude/agents',
      'docs/roveflow/runs',
      'lib/core/mcp',
    ]) {
      final dir = Directory(p.join(target.path, rel));
      if (!dir.existsSync()) {
        dir.createSync(recursive: true);
        created.add(rel);
      }
    }

    // Materialise every bundled skill file into .claude/skills/roveflow/
    final skillTarget =
        Directory(p.join(target.path, '.claude/skills/roveflow'));
    var anySkillWritten = false;
    for (final relPath in bundledSkillPaths()) {
      final out = File(p.join(skillTarget.path, relPath));
      final desired = bundledSkillFile(relPath);
      final logRel = '.claude/skills/roveflow/$relPath';
      if (_writeIfSafe(
        file: out,
        desired: desired,
        force: force,
        relForLog: logRel,
        skipped: skipped,
      )) {
        anySkillWritten = true;
      }
    }
    if (anySkillWritten) {
      created.add('.claude/skills/roveflow/ (bundled skill materialised)');
    }

    // Slash command — points to the skill
    if (_writeIfSafe(
      file: File(p.join(target.path, '.claude/commands/roveflow.md')),
      desired: bundledSkillFile('references/slash-command.template.md'),
      force: force,
      relForLog: '.claude/commands/roveflow.md',
      skipped: skipped,
    )) {
      created.add('.claude/commands/roveflow.md');
    }

    // Sub-agent
    if (_writeIfSafe(
      file: File(p.join(target.path, '.claude/agents/roveflow-runner.md')),
      desired: bundledSkillFile('references/roveflow-runner.template.md'),
      force: force,
      relForLog: '.claude/agents/roveflow-runner.md',
      skipped: skipped,
    )) {
      created.add('.claude/agents/roveflow-runner.md');
    }

    // MCP interaction tools drop-in — substitute <your_app> with pubspec name
    final pkgName = _readPackageName(target);
    final toolsRaw = bundledSkillFile('references/mcp_interaction_tools.dart');
    final tools = toolsRaw.replaceAll(
      // Drop the 3-line hint comment + the placeholder import, replace with the real import.
      RegExp(
        r"// REPLACE the import below.*?\n"
        r"// a top-level `navigate\.pop\(\)` helper\. Example:\n"
        r"//\s+import 'package:<your_app>/core/general_helpers/utils/navigation_util\.dart';\n"
        r"import 'package:<your_app>/core/general_helpers/utils/navigation_util\.dart';",
        dotAll: true,
      ),
      "import 'package:$pkgName/core/general_helpers/utils/navigation_util.dart';",
    );
    if (_writeIfSafe(
      file: File(p.join(target.path, 'lib/core/mcp/mcp_interaction_tools.dart')),
      desired: tools,
      force: force,
      relForLog: 'lib/core/mcp/mcp_interaction_tools.dart',
      skipped: skipped,
    )) {
      created.add('lib/core/mcp/mcp_interaction_tools.dart');
    }

    // .mcp.json — write if missing, warn if present without flutter-inspector
    // This is a special case: we don't use _writeIfSafe because we never
    // want to overwrite an existing non-Roveflow .mcp.json even with --force.
    _writeOrMergeMcpConfig(target.path);
    created.add('.mcp.json (written or verified)');

    // Real scenarios.md — overwrite the placeholder from the skeleton
    if (_writeIfSafe(
      file: File(p.join(target.path, 'docs/roveflow/scenarios.md')),
      desired: bundledSkillFile('references/scenarios.template.md'),
      force: force,
      relForLog: 'docs/roveflow/scenarios.md',
      skipped: skipped,
    )) {
      created.add('docs/roveflow/scenarios.md');
    }

    stdout.writeln('');
    stdout.writeln('[ok] Roveflow installed at ${target.path}');
    stdout.writeln('');
    stdout.writeln('Created (${created.length}):');
    for (final c in created) {
      stdout.writeln('  + $c');
    }
    stdout.writeln('');
    if (skipped.isNotEmpty) {
      stdout.writeln('Skipped (${skipped.length} file(s) differ from bundled — pass --force to overwrite):');
      for (final s in skipped) {
        stdout.writeln('  ~ $s');
      }
      stdout.writeln('');
    }
    stdout.writeln('Next steps:');
    stdout.writeln('  1. Add one line to main.dart inside your kDebugMode block:');
    stdout.writeln('       await registerMcpInteractionTools();');
    stdout.writeln('     (imports: lib/core/mcp/mcp_interaction_tools.dart)');
    stdout.writeln('  2. Export ROVEFLOW_FLUTTER_INSPECTOR to your flutter_inspector_mcp binary path.');
    stdout.writeln('  3. Add mcp_toolkit to pubspec.yaml dependencies.');
    stdout.writeln('  4. Fill in docs/roveflow/scenarios.md cold-setup flow.');
    stdout.writeln('  5. Boot your app (debug) and run /roveflow --only=cold-setup in Claude Code.');
    stdout.writeln('');
    stdout.writeln('Full setup guide: .claude/skills/roveflow/references/setup.md');
    stdout.writeln('');
    return 0;
  }

  /// Writes [desired] to [file] only if it is safe to do so.
  ///
  /// Safe means one of:
  ///   - The file does not yet exist (first-time write).
  ///   - The existing content is identical to [desired] (idempotent no-op).
  ///   - [force] is true (caller explicitly opted in to overwrite).
  ///
  /// When the file exists, differs, and [force] is false the relative path
  /// [relForLog] is appended to [skipped] and the method returns false.
  ///
  /// Returns true when a write actually happened, false otherwise.
  bool _writeIfSafe({
    required File file,
    required String desired,
    required bool force,
    required String relForLog,
    required List<String> skipped,
  }) {
    if (file.existsSync()) {
      final existing = file.readAsStringSync();
      if (existing == desired) return false; // identical, no-op, no log
      if (!force) {
        skipped.add(relForLog);
        return false;
      }
    }
    file.parent.createSync(recursive: true);
    file.writeAsStringSync(desired);
    return true;
  }

  void _writeOrMergeMcpConfig(String root) {
    final f = File(p.join(root, '.mcp.json'));
    final snippet = bundledSkillFile('references/mcp-config.snippet.json');
    if (!f.existsSync()) {
      f.writeAsStringSync(snippet);
      return;
    }
    final existing = f.readAsStringSync();
    if (existing.contains('"flutter-inspector"')) return;
    stderr.writeln(
      'roveflow init: .mcp.json already exists without a flutter-inspector '
      'entry. Merge manually from '
      '.claude/skills/roveflow/references/mcp-config.snippet.json.',
    );
  }

  bool _isFlutterProject(Directory dir) {
    final pubspec = File(p.join(dir.path, 'pubspec.yaml'));
    if (!pubspec.existsSync()) return false;
    final content = pubspec.readAsStringSync();
    return content.contains('sdk: flutter');
  }

  String _readPackageName(Directory target) {
    final pubspec = File(p.join(target.path, 'pubspec.yaml')).readAsStringSync();
    final match = RegExp(r'^name:\s*([A-Za-z0-9_]+)', multiLine: true).firstMatch(pubspec);
    if (match == null) throw StateError('Cannot read pubspec name from ${target.path}');
    return match.group(1)!;
  }
}
