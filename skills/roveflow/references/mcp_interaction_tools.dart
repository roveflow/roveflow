// lib/core/mcp/mcp_interaction_tools.dart

import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:mcp_toolkit/mcp_toolkit.dart';
// REPLACE the import below with your project's navigation utility that exposes
// a top-level `navigate.pop()` helper. Example:
//   import 'package:<your_app>/core/general_helpers/utils/navigation_util.dart';
import 'package:<your_app>/core/general_helpers/utils/navigation_util.dart';

/// Registers all custom MCP interaction tools with the toolkit binding.
/// Must only be called in debug mode.
Future<void> registerMcpInteractionTools() async {
  await MCPToolkitBinding.instance.addEntries(
    entries: {
      MCPCallEntry.tool(
        handler: (params) {
          navigate.pop();
          return MCPCallResult(message: 'Navigated back', parameters: {});
        },
        definition: MCPToolDefinition(
          name: 'navigate_back',
          description: 'Pops the current route, bottom sheet, or dialog',
          inputSchema: ObjectSchema(properties: {}),
        ),
      ),
      MCPCallEntry.tool(
        handler: (params) {
          final text = params['text'];
          if (text == null || text.isEmpty) {
            return MCPCallResult(
              message: 'Error: text param required',
              parameters: {},
            );
          }
          return MCPCallResult(message: _tapByText(text), parameters: {});
        },
        definition: MCPToolDefinition(
          name: 'tap_by_text',
          description: 'Finds a widget with the given visible text and taps it',
          inputSchema: ObjectSchema(
            properties: {
              'text': StringSchema(
                description: 'Exact visible text of the widget to tap',
              ),
            },
            required: ['text'],
          ),
        ),
      ),
      MCPCallEntry.tool(
        handler: (params) {
          final key = params['key'];
          if (key == null || key.isEmpty) {
            return MCPCallResult(
              message: 'Error: key param required',
              parameters: {},
            );
          }
          return MCPCallResult(message: _tapByKey(key), parameters: {});
        },
        definition: MCPToolDefinition(
          name: 'tap_by_key',
          description:
              'Finds a widget with the given ValueKey string and taps it',
          inputSchema: ObjectSchema(
            properties: {
              'key': StringSchema(
                description: 'The string value of the ValueKey on the widget',
              ),
            },
            required: ['key'],
          ),
        ),
      ),
      MCPCallEntry.tool(
        handler: (params) async {
          final text = params['text'];
          if (text == null || text.isEmpty) {
            return MCPCallResult(
              message: 'Error: text param required',
              parameters: {},
            );
          }
          return MCPCallResult(
            message: await _scrollToText(text),
            parameters: {},
          );
        },
        definition: MCPToolDefinition(
          name: 'scroll_to_text',
          description: 'Scrolls until a widget with the given text is visible',
          inputSchema: ObjectSchema(
            properties: {
              'text': StringSchema(
                description: 'Exact visible text to scroll to',
              ),
            },
            required: ['text'],
          ),
        ),
      ),
      MCPCallEntry.tool(
        handler: (params) {
          final x = params['x'];
          final y = params['y'];
          if (x == null || y == null) {
            return MCPCallResult(
              message: 'Error: x and y params required',
              parameters: {},
            );
          }
          final position = Offset(
            double.tryParse(x.toString()) ?? 0,
            double.tryParse(y.toString()) ?? 0,
          );
          _dispatchTap(position);
          return MCPCallResult(
            message: 'Tapped at (${position.dx}, ${position.dy})',
            parameters: {},
          );
        },
        definition: MCPToolDefinition(
          name: 'tap_at',
          description:
              'Dispatches a tap at the given logical pixel coordinates (x, y)',
          inputSchema: ObjectSchema(
            properties: {
              'x': StringSchema(description: 'Logical x coordinate'),
              'y': StringSchema(description: 'Logical y coordinate'),
            },
            required: ['x', 'y'],
          ),
        ),
      ),
      MCPCallEntry.tool(
        handler: (params) {
          final startX = double.tryParse(params['start_x'].toString()) ?? 0;
          final startY = double.tryParse(params['start_y'].toString()) ?? 0;
          final endX = double.tryParse(params['end_x'].toString()) ?? 0;
          final endY = double.tryParse(params['end_y'].toString()) ?? 0;
          final steps = int.tryParse(params['steps']?.toString() ?? '10') ?? 10;
          _dispatchSwipe(Offset(startX, startY), Offset(endX, endY), steps);
          return MCPCallResult(
            message:
                'Swiped from ($startX, $startY) to ($endX, $endY) in $steps steps',
            parameters: {},
          );
        },
        definition: MCPToolDefinition(
          name: 'swipe',
          description:
              'Dispatches a swipe gesture from (start_x, start_y) to (end_x, end_y). '
              'Use for horizontal scrolling of date pickers, carousels, etc.',
          inputSchema: ObjectSchema(
            properties: {
              'start_x': StringSchema(
                description: 'Start logical x coordinate',
              ),
              'start_y': StringSchema(
                description: 'Start logical y coordinate',
              ),
              'end_x': StringSchema(description: 'End logical x coordinate'),
              'end_y': StringSchema(description: 'End logical y coordinate'),
              'steps': StringSchema(
                description: 'Number of intermediate points (default 10)',
              ),
            },
            required: ['start_x', 'start_y', 'end_x', 'end_y'],
          ),
        ),
      ),
    },
  );
}

String _tapByText(String text) {
  final element = _findElementByText(
    WidgetsBinding.instance.rootElement!,
    text,
  );
  if (element == null) return 'Error: widget with text "$text" not found';
  return _tapElement(element, 'text "$text"');
}

Element? _findElementByText(Element root, String text) {
  Element? found;
  root.visitChildElements((child) {
    if (found != null) return;
    if (child.widget is RichText) {
      final rt = child.widget as RichText;
      if (rt.text.toPlainText() == text) {
        found = child;
        return;
      }
    }
    found ??= _findElementByText(child, text);
  });
  return found;
}

String _tapElement(Element element, String label) {
  final renderObject = element.renderObject;
  if (renderObject is! RenderBox) {
    return 'Error: render object for $label is not a RenderBox';
  }
  final position = renderObject.localToGlobal(
    renderObject.size.center(Offset.zero),
  );
  _dispatchTap(position);
  return 'Tapped $label at (${position.dx.toStringAsFixed(1)}, ${position.dy.toStringAsFixed(1)})';
}

void _dispatchTap(Offset position) {
  final binding = GestureBinding.instance;
  binding.handlePointerEvent(PointerDownEvent(position: position));
  binding.handlePointerEvent(PointerUpEvent(position: position));
}

void _dispatchSwipe(Offset start, Offset end, int steps) {
  final binding = GestureBinding.instance;
  binding.handlePointerEvent(PointerDownEvent(position: start));
  for (int i = 1; i <= steps; i++) {
    final t = i / steps;
    final mid = Offset(
      start.dx + (end.dx - start.dx) * t,
      start.dy + (end.dy - start.dy) * t,
    );
    binding.handlePointerEvent(PointerMoveEvent(position: mid));
  }
  binding.handlePointerEvent(PointerUpEvent(position: end));
}

String _tapByKey(String keyValue) {
  final element = _findElementByKey(
    WidgetsBinding.instance.rootElement!,
    ValueKey(keyValue),
  );
  if (element == null) return 'Error: widget with key "$keyValue" not found';
  return _tapElement(element, 'key "$keyValue"');
}

Element? _findElementByKey(Element root, ValueKey key) {
  Element? found;
  root.visitChildElements((child) {
    if (found != null) return;
    if (child.widget.key == key) {
      found = child;
      return;
    }
    found ??= _findElementByKey(child, key);
  });
  return found;
}

Future<String> _scrollToText(String text) async {
  final element = _findElementByText(
    WidgetsBinding.instance.rootElement!,
    text,
  );
  if (element == null) return 'Error: widget with text "$text" not found';
  final renderObject = element.renderObject;
  if (renderObject == null) return 'Error: no render object for "$text"';
  await Scrollable.ensureVisible(
    element,
    duration: const Duration(milliseconds: 300),
    curve: Curves.easeInOut,
  );
  return 'Scrolled to text "$text"';
}
