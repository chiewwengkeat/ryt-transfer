import { render } from "@testing-library/react-native";
import { ExpoRoot, usePathname } from "expo-router";
import {
  getMockContext,
  type MockContextConfig,
} from "expo-router/testing-library";
import { useEffect, type ReactNode } from "react";

export async function renderRoute(
  initialUrl: string,
  routes: MockContextConfig = "src/app",
) {
  const pathnameRecorder = jest.fn<void, [string]>();
  function PathnameRecorder({ children }: { children?: ReactNode }) {
    const pathname = usePathname();
    useEffect(() => {
      pathnameRecorder(pathname);
    }, [pathname]);
    return children;
  }

  jest.useFakeTimers();
  process.env.EXPO_ROUTER_IMPORT_MODE = "sync";
  const view = await render(
    <ExpoRoot
      context={getMockContext(routes)}
      location={initialUrl}
      wrapper={PathnameRecorder}
    />,
  );
  return Object.assign(view, {
    getPathname: () => pathnameRecorder.mock.lastCall?.[0],
  });
}
