import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { requestJson } from "@/shared/http/transport";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

import TextHeading from "./TextHeading";

const pageStore = createStore<{ pageOpened: boolean }>(() => ({
  pageOpened: false,
}));

function PageFocusingItsHeadingOnceOpened() {
  const pageOpened = useStore(pageStore, (page) => page.pageOpened);
  return <TextHeading autoFocus={pageOpened}>Page opened</TextHeading>;
}

it("moves a screen reader to a heading that asks for it beneath the session-ended view only once they sign in again", async () => {
  // Jest has no screen reader: the focus request is the nearest thing it can see.
  const focusRequests = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
  const headingFocusRequests = () =>
    focusRequests.mock.calls.filter(
      ([target, eventType]) =>
        eventType === "focus" &&
        (target as { props?: { children?: unknown } }).props?.children ===
          "Page opened",
    );
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: PageFocusingItsHeadingOnceOpened },
  });
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
  const signInAgain = screen.getByRole("button", { name: "Sign in again" });

  await act(() => {
    pageStore.setState({ pageOpened: true });
  });
  const focusRequestsUnderTheView = headingFocusRequests().length;
  await fireEvent.press(signInAgain);

  expect(focusRequestsUnderTheView).toBe(0);
  expect(headingFocusRequests()).toHaveLength(1);
});
