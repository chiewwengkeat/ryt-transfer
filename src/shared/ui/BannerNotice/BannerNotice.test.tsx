import { render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import BannerNotice from "./BannerNotice";

it("announces each new message once, by announcing it and through no live region", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();

  const view = await render(<BannerNotice message="Check your connection" />);
  await view.rerender(<BannerNotice message="Back online" />);

  expect(announce.mock.calls).toEqual([
    ["Check your connection"],
    ["Back online"],
  ]);
  expect(JSON.stringify(view.toJSON())).not.toMatch(
    /accessibilityLiveRegion|aria-live/,
  );
});
