import { fireEvent, render, screen } from "@testing-library/react-native";
import { ScrollView, Text, TextInput } from "react-native";
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

async function fireContentLayout(
  content: typeof screen.container,
  height: number,
) {
  await fireEvent(content, "layout", {
    persist: () => undefined,
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
}

// Jest lays nothing out and focuses nothing. As React Native reports it, the y ignores the scroll: it is the
// field's place in the content. The field is 48 tall; the labelled control kept in view below it takes 92.
function focusFieldAtContentY(fieldTopInContent: number) {
  jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue({
    measureLayout: (
      _relativeTo: unknown,
      reportLayout: (
        x: number,
        y: number,
        width: number,
        height: number,
      ) => void,
    ) => {
      reportLayout(16, fieldTopInContent, 358, 48);
    },
  } as unknown as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
}

async function mountFrameScrolledTo(scrollOffset: number) {
  await render(<ScreenFramesInStack />);
  let content = screen.getByText("Home").parent;
  while (content !== null && content.type !== "RCTScrollView")
    content = content.parent;
  if (content === null) throw new Error("The frame's content does not scroll.");
  await fireEvent.scroll(content, {
    nativeEvent: { contentOffset: { x: 0, y: scrollOffset } },
  });
  return content;
}

function watchScrolls() {
  const scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo");
  scrollTo.mockClear();
  return scrollTo;
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

it("scrolls the field being typed in up only as far as keeps room below it for the next control", async () => {
  focusFieldAtContentY(200);
  const content = await mountFrameScrolledTo(0);
  const scrollTo = watchScrolls();

  await fireContentLayout(content, 500);
  await fireContentLayout(content, 300);

  expect(scrollTo.mock.calls).toEqual([[{ y: 200 + 48 + 92 - 300 }]]);
});

it("scrolls a screen already scrolled down from where it is, only as far as the field needs", async () => {
  focusFieldAtContentY(300);
  const content = await mountFrameScrolledTo(100);
  const scrollTo = watchScrolls();

  await fireContentLayout(content, 500);
  await fireContentLayout(content, 300);

  expect(scrollTo.mock.calls).toEqual([[{ y: 300 + 48 + 92 - 300 }]]);
});

it("leaves a screen already scrolled down where it is until the field runs out of room below it", async () => {
  focusFieldAtContentY(400);
  const content = await mountFrameScrolledTo(300);
  const scrollTo = watchScrolls();

  await fireContentLayout(content, 500);
  await fireContentLayout(content, 300);
  const scrollsWithRoomToSpare = [...scrollTo.mock.calls];
  await fireContentLayout(content, 200);

  expect(scrollsWithRoomToSpare).toEqual([]);
  expect(scrollTo.mock.calls).toEqual([[{ y: 400 + 48 + 92 - 200 }]]);
});

it("never scrolls the field's own top out of sight, even where the room below it cannot all show", async () => {
  focusFieldAtContentY(300);
  const content = await mountFrameScrolledTo(100);
  const scrollTo = watchScrolls();

  await fireContentLayout(content, 500);
  await fireContentLayout(content, 100);

  expect(scrollTo.mock.calls).toEqual([[{ y: 300 }]]);
});

it("publishes 0 while the screen on top has no footer", async () => {
  const view = await render(<ScreenFramesInStack />);
  await fireFooterLayout("Home footer", 120);

  await view.rerender(<ScreenFramesInStack receiptOnTop />);

  expect(screen.getByText("Footer height 0")).toBeOnTheScreen();
});
