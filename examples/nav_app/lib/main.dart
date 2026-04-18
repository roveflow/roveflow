import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mcp_toolkit/mcp_toolkit.dart';
import 'package:nav_app/core/general_helpers/utils/navigation_util.dart';
import 'package:nav_app/core/mcp/mcp_interaction_tools.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (kDebugMode) {
    MCPToolkitBinding.instance
      ..initialize()
      ..initializeFlutterToolkit();
    await registerMcpInteractionTools();
  }
  runApp(const NavApp());
}

class NavApp extends StatelessWidget {
  const NavApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: rootNavigatorKey,
      title: 'Nav App',
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nav App Home')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Welcome to Nav App'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DetailPage()),
              ),
              child: const Text('Open Detail'),
            ),
          ],
        ),
      ),
    );
  }
}

class DetailPage extends StatelessWidget {
  const DetailPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Detail')),
      body: const Center(child: Text('You are on Detail')),
    );
  }
}
