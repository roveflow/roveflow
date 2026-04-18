import 'package:args/command_runner.dart';
import 'commands/doctor_command.dart';
import 'commands/init_command.dart';
import 'commands/version_command.dart';

class CliRunner {
  Future<int> run(List<String> args) async {
    final runner = CommandRunner<int>(
      'roveflow',
      'AI-first E2E test orchestration for Flutter',
    )
      ..addCommand(VersionCommand())
      ..addCommand(InitCommand())
      ..addCommand(DoctorCommand());
    final result = await runner.run(args);
    return result ?? 0;
  }
}
