import { act, screen, within } from "@testing-library/react-native";
import {
  Dimensions,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { renderRoute } from "@/test/render-route";
import {
  buildHistoryTransfer,
  serveTransferHistoryPages,
} from "@/test/transfer-history-pages";

const WINDOW_AT_LAUNCH = Dimensions.get("window");
const SCREEN_AT_LAUNCH = Dimensions.get("screen");

afterEach(() => {
  Dimensions.set({ window: WINDOW_AT_LAUNCH, screen: SCREEN_AT_LAUNCH });
});

function setPhoneTextSize(fontScale: number) {
  Dimensions.set({
    window: { ...WINDOW_AT_LAUNCH, fontScale },
    screen: { ...SCREEN_AT_LAUNCH, fontScale },
  });
}

function flexBasisOf(element: ReturnType<typeof screen.getByText> | null) {
  return StyleSheet.flatten(element?.props.style as StyleProp<ViewStyle>)
    .flexBasis;
}

// Jest lays nothing out: these pin the styles a device's wrap relies on, and only a device shows the wrap.
it("keeps a transfer's name and a day's title in a column that widens with the text size, wrapping the amount below them instead of squeezing them", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()]]);
  setPhoneTextSize(1);
  await renderRoute("/transfer-history");
  const nameColumn = (await screen.findByText("Aisyah Rahman")).parent;
  const dayHeader = screen.getByRole("button", { expanded: true });
  const dayTitleColumn = within(dayHeader).getByText(/\(1\)$/).parent;
  const nameWidthAtDefaultSize = flexBasisOf(nameColumn);
  const dayTitleWidthAtDefaultSize = flexBasisOf(dayTitleColumn);
  expect(nameWidthAtDefaultSize).toBeGreaterThan(0);
  expect(dayTitleWidthAtDefaultSize).toBeGreaterThan(0);

  await act(() => {
    setPhoneTextSize(2.143);
  });

  expect(flexBasisOf(nameColumn)).toBeCloseTo(
    Number(nameWidthAtDefaultSize) * 2.143,
  );
  expect(flexBasisOf(dayTitleColumn)).toBeCloseTo(
    Number(dayTitleWidthAtDefaultSize) * 2.143,
  );
  expect(nameColumn?.parent).toHaveStyle({ flexWrap: "wrap" });
  expect(dayTitleColumn?.parent).toHaveStyle({ flexWrap: "wrap" });
  // Yoga ignores a column's basis while the column is its row's only flexible child.
  const transferRow = screen.getByRole("button", { name: /Aisyah Rahman/ });
  expect(within(transferRow).getByText("-RM 50.00").parent).toHaveStyle({
    flexShrink: 1,
  });
  expect(within(dayHeader).getByText("-RM 50.00").parent).toHaveStyle({
    flexShrink: 1,
  });
});
