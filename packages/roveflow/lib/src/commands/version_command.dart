import 'dart:io';
import 'package:args/command_runner.dart';

const roveflowVersion = '0.1.0';

class VersionCommand extends Command<int> {
  @override
  String get name => 'version';

  @override
  String get description => 'Print the Roveflow version and exit.';

  @override
  Future<int> run() async {
    stdout.writeln(roveflowVersion);
    return 0;
  }
}
