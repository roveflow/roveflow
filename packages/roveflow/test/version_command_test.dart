import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

void main() {
  test('roveflow version exits 0 and prints a semver', () async {
    final pkgRoot = Directory.current.path;
    final result = await Process.run(
      'dart',
      ['run', p.join('bin', 'roveflow.dart'), 'version'],
      workingDirectory: pkgRoot,
    );
    expect(result.exitCode, 0, reason: 'stderr: ${result.stderr}');
    expect(result.stdout.toString().trim(), matches(r'^\d+\.\d+\.\d+$'));
  });
}
