import { fireEvent, screen } from "@testing-library/react-native";
import { ReduceMotion } from "react-native-reanimated";

import {
  turnOnPhoneReduceMotion,
  watchReduceMotionOfAnimations,
} from "@/test/render/reduced-motion";
import { renderRoute } from "@/test/render/render-route";
import {
  buildHistoryTransfer,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-history-pages";

it("turns a day's chevron at once when the phone reduces motion", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()]]);
  await renderRoute("/transfer-history");
  const dayHeader = await screen.findByRole("button", { expanded: true });
  await turnOnPhoneReduceMotion();
  const reduceMotionOfAnimations = watchReduceMotionOfAnimations();

  await fireEvent.press(dayHeader);

  expect(screen.getByRole("button", { expanded: false })).toBeOnTheScreen();
  expect([...new Set(reduceMotionOfAnimations())]).toEqual([
    ReduceMotion.Always,
  ]);
});
