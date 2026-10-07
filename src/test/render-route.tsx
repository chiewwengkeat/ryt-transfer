import { render } from "@testing-library/react-native";
import { ExpoRoot, usePathname } from "expo-router";
import {
  getMockContext,
  type MockContextConfig,
} from "expo-router/testing-library";
import { useEffect, type ReactNode } from "react";

// renderRoute's fake timers last one test: left on, they stall the next test's msw delay().
afterEach(() => {
  jest.useRealTimers();
});

export async function renderRoute(
  initialUrl: string,
  routes: MockContextConfig = "src/app",
) {
  const recordPathname = jest.fn<void, [string]>();
  function PathnameRecorder({ children }: { children?: ReactNode }) {
    const pathname = usePathname();
    useEffect(() => {
      recordPathname(pathname);
    }, [pathname]);
    return children;
  }

  // renderRouter's setup; renderRouter itself calls Testing Library 14's async render
  // synchronously on SDK 57 and fails.
  jest.useFakeTimers();
  const view = await render(
    <ExpoRoot
      context={getMockContext(routes)}
      location={initialUrl}
      wrapper={PathnameRecorder}
    />,
  );
  return Object.assign(view, {
    getPathname: () => recordPathname.mock.lastCall?.[0],
  });
}
