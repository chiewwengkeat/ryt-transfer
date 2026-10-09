import { act } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { AccessibilityInfo } from "react-native";
import { create } from "zustand";

import { renderRoute } from "@/test/render-route";

import BannerNotice from "./BannerNotice";

const bannerMessageStore = create(() => ({
  message: "Check your connection",
}));

const SCREEN_WITH_BANNER_UNDER_DETAILS = {
  _layout: () => <Stack />,
  index: function ScreenWithBanner() {
    return (
      <BannerNotice message={bannerMessageStore((state) => state.message)} />
    );
  },
  details: () => null,
};

beforeEach(() => {
  bannerMessageStore.setState(bannerMessageStore.getInitialState(), true);
});

it("announces each new message once, by announcing it and through no live region", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();

  const view = await renderRoute("/", SCREEN_WITH_BANNER_UNDER_DETAILS);
  await act(() => {
    bannerMessageStore.setState({ message: "Back online" });
  });

  expect(announce.mock.calls).toEqual([
    ["Check your connection"],
    ["Back online"],
  ]);
  expect(JSON.stringify(view.toJSON())).not.toMatch(
    /accessibilityLiveRegion|aria-live/,
  );
});

it("holds a message that changes beneath another screen until its own screen is on top again, then says it once", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  await renderRoute("/", SCREEN_WITH_BANNER_UNDER_DETAILS);
  // Relative, as the app's generated routes hold no "/details" and would reject it.
  await act(() => {
    router.push("./details");
  });
  announce.mockClear();

  await act(() => {
    bannerMessageStore.setState({ message: "Back online" });
  });
  expect(announce).not.toHaveBeenCalled();

  await act(() => {
    router.back();
  });
  await act(() => {
    router.push("./details");
  });
  await act(() => {
    router.back();
  });
  expect(announce.mock.calls).toEqual([["Back online"]]);
});
