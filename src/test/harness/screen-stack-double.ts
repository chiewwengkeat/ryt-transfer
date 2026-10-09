import {
  type ComponentProps,
  createElement,
  isValidElement,
  useLayoutEffect,
} from "react";
import type * as ReactNativeScreens from "react-native-screens";

const routesDrawnOnTop: string[] = [];

// Jest draws no frames, so what each native stack is handed on top, commit by commit, is what a phone animates to.
export function reactNativeScreensRecordingTopRoutes() {
  const actual = jest.requireActual<typeof ReactNativeScreens>(
    "react-native-screens",
  );
  return {
    ...actual,
    ScreenStack(props: ComponentProps<typeof actual.ScreenStack>) {
      const topRouteName = [props.children]
        .flat()
        .filter(
          isValidElement<{
            isPreloaded: boolean;
            descriptor: { route: { name: string } };
          }>,
        )
        .findLast((scene) => !scene.props.isPreloaded)?.props.descriptor
        .route.name;
      useLayoutEffect(() => {
        if (topRouteName !== undefined) routesDrawnOnTop.push(topRouteName);
      });
      return createElement(actual.ScreenStack, props);
    },
  };
}

export function watchRoutesDrawnOnTop() {
  const watchedFrom = routesDrawnOnTop.length;
  return () => routesDrawnOnTop.slice(watchedFrom);
}

export function resetScreenStackDouble() {
  routesDrawnOnTop.splice(0);
}
