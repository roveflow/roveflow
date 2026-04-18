import 'package:flutter/widgets.dart';

final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

class _Navigate {
  const _Navigate();

  void pop() {
    final state = rootNavigatorKey.currentState;
    if (state != null && state.canPop()) state.pop();
  }
}

const navigate = _Navigate();
