import { fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { renderRoute } from "@/test/render-route";
import {
  buildHistoryTransfer,
  failTransferHistoryPages,
  serveTransferHistoryPages,
} from "@/test/transfer-history-pages";

const LIM_ON_4_OCTOBER = buildHistoryTransfer({
  registeredName: "Lim Wei Jie",
  createdAt: "2026-10-04T13:05:00+08:00",
});

it("hands a 401 to the session-ended view", async () => {
  failTransferHistoryPages("first", 401);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
});

it("says no failure of a first read only the session's end failed, and lists the transfers once they sign in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  const recoverFirstPages = failTransferHistoryPages("first", 401);
  await renderRoute("/transfer-history");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  // ⛔ Keep this wait: pressed sooner, the view lifts before the failure shows, and this passes either way.
  await screen.findByText("Couldn't load your transfers.", {
    includeHiddenElements: true,
  });
  recoverFirstPages();

  await fireEvent.press(signInAgain);

  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalledWith("Couldn't load your transfers.");
});

it("says no failure of a next page only the session's end failed, and loads it once they sign in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  const recoverLaterPages = failTransferHistoryPages("later", 401);
  await renderRoute("/transfer-history");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  // ⛔ Keep this wait: pressed sooner, the view lifts before the failure shows, and this passes either way.
  await screen.findByText("Couldn't load more.", {
    includeHiddenElements: true,
  });
  recoverLaterPages();

  await fireEvent.press(signInAgain);

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalledWith("Couldn't load more.");
});

it("says no failure of a pull only the session's end failed, and shows the newest page once they sign in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  serveTransferHistoryPages([[buildHistoryTransfer(), LIM_ON_4_OCTOBER]]);
  const recoverFirstPages = failTransferHistoryPages("first", 401);
  await fireEvent(aisyah, "refresh");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  // ⛔ Keep this wait: pressed sooner, the view lifts before the failure shows, and this passes either way.
  await screen.findByText("Couldn't refresh — this list may be out of date", {
    includeHiddenElements: true,
  });
  recoverFirstPages();

  await fireEvent.press(signInAgain);

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalledWith(
    "Couldn't refresh — this list may be out of date",
  );
});
