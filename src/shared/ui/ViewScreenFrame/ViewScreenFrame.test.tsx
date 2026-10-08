import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ViewScreenFrame, { useScreenFooterHeight } from "./ViewScreenFrame";

const PHONE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function TextFooterHeight() {
  return <Text>{`Footer height ${useScreenFooterHeight()}`}</Text>;
}

function ScreenFramesInStack({
  reviewOnTop = false,
  receiptOnTop = false,
}: {
  reviewOnTop?: boolean;
  receiptOnTop?: boolean;
}) {
  return (
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <ViewScreenFrame footer={<Text>Home footer</Text>}>
        <Text>Home</Text>
      </ViewScreenFrame>
      {reviewOnTop && (
        <ViewScreenFrame footer={<Text>Review footer</Text>}>
          <Text>Review</Text>
        </ViewScreenFrame>
      )}
      {receiptOnTop && (
        <ViewScreenFrame>
          <Text>Receipt</Text>
        </ViewScreenFrame>
      )}
      <TextFooterHeight />
    </SafeAreaProvider>
  );
}

async function fireFooterLayout(footerText: string, height: number) {
  await fireEvent(screen.getByText(footerText), "layout", {
    nativeEvent: { layout: { height } },
  });
}

it("publishes the footer height of the screen on top, even when it is the shorter one", async () => {
  const view = await render(<ScreenFramesInStack />);
  await fireFooterLayout("Home footer", 120);

  await view.rerender(<ScreenFramesInStack reviewOnTop />);
  await fireFooterLayout("Review footer", 80);

  expect(screen.getByText("Footer height 80")).toBeOnTheScreen();
});

it("falls back to the footer of the screen beneath once the screen on top unmounts", async () => {
  const view = await render(<ScreenFramesInStack reviewOnTop />);
  await fireFooterLayout("Home footer", 120);
  await fireFooterLayout("Review footer", 80);

  await view.rerender(<ScreenFramesInStack />);

  expect(screen.getByText("Footer height 120")).toBeOnTheScreen();
});

it("publishes 0 while the screen on top has no footer", async () => {
  const view = await render(<ScreenFramesInStack />);
  await fireFooterLayout("Home footer", 120);

  await view.rerender(<ScreenFramesInStack receiptOnTop />);

  expect(screen.getByText("Footer height 0")).toBeOnTheScreen();
});
