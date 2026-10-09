import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { spacing } from "@/shared/theme/theme";
import { mswServer } from "@/test/mock-bank/mock-bank";
import { renderRoute } from "@/test/render/render-route";

const OFFLINE_NOTICE =
  "You're offline. Sending is paused until Ryt can be reached.";

it("lets Home's content scroll clear of the offline notice by the notice's measured height, and gives the room back once online", async () => {
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await renderRoute("/");
  const notice = await screen.findByText(OFFLINE_NOTICE);
  let homeScroll = screen.getByRole("button", {
    name: "Transfer history",
  }).parent;
  while (homeScroll !== null && homeScroll.type !== "RCTScrollView")
    homeScroll = homeScroll.parent;
  const contentEndPadding = () =>
    StyleSheet.flatten(
      homeScroll?.props.contentContainerStyle as StyleProp<ViewStyle>,
    ).paddingBottom;
  const endPaddingWithoutNotice = Number(contentEndPadding());

  await fireEvent(notice, "layout", {
    nativeEvent: { layout: { height: 154 } },
  });

  expect(contentEndPadding()).toBe(endPaddingWithoutNotice + 154 + spacing.sm);

  const tryAgain = await screen.findByRole("button", { name: "Try again" });
  mswServer.resetHandlers();
  await fireEvent.press(tryAgain);
  await waitFor(() => {
    expect(screen.queryByText(OFFLINE_NOTICE)).toBeNull();
  });

  expect(contentEndPadding()).toBe(endPaddingWithoutNotice);
});
