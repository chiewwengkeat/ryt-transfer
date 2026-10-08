import type { QueryKey } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import { ExpoRoot, usePathname } from "expo-router";
import {
  getMockContext,
  type MockContextConfig,
} from "expo-router/testing-library";
import { changeLanguage } from "i18next";
import { useEffect, type ReactNode } from "react";

import { transferFlowStore } from "@/screens/transfer/state/transfer-flow";
import { AppLanguage, initTranslations } from "@/shared/i18n/i18n";
import { queryClient } from "@/shell/query-client";
import { TRANSLATION_BUNDLES } from "@/shell/translations";

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
  // Real queueMicrotask: faked, a render that restarts a refetch interval as it fires crashes fake-timers 10.3.
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
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

export function askOpenAppToReadAgain(queryKey: QueryKey) {
  void queryClient.invalidateQueries({ queryKey });
}

// What a killed app keeps is what it stored: its timers, cache, flow and language die with it. A stray timer
// would let the old app's approval answer navigate the new one; a language left set would pass for a kept pick.
export async function relaunchApp(
  view: Awaited<ReturnType<typeof renderRoute>>,
) {
  await view.unmount();
  jest.clearAllTimers();
  for (const mutation of queryClient.getMutationCache().getAll())
    mutation.destroy();
  queryClient.clear();
  transferFlowStore.setState(transferFlowStore.getInitialState(), true);
  await changeLanguage(AppLanguage.English);
  initTranslations(TRANSLATION_BUNDLES);
  return renderRoute("/");
}
