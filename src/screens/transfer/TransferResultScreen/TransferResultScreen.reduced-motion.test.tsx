import { fireEvent, screen } from "@testing-library/react-native";
import { ReduceMotion } from "react-native-reanimated";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  turnOnPhoneReduceMotion,
  watchReduceMotionOfAnimations,
} from "@/test/render/reduced-motion";
import { renderRoute } from "@/test/render/render-route";

it("fades into a sent transfer's result and shows its outcome and tick at once when the phone reduces motion", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await turnOnPhoneReduceMotion();
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByRole("button", { name: "Transfer" });
  const reduceMotionOfAnimations = watchReduceMotionOfAnimations();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  const outcome = await screen.findByText("Transfer sent");
  // The stack hands its transition to each native screen as this prop; nothing else of it renders in Jest.
  const screenTransitions: unknown[] = [];
  for (let host = outcome.parent; host !== null; host = host.parent)
    if (host.props.stackAnimation !== undefined)
      screenTransitions.push(host.props.stackAnimation);
  expect([...new Set(screenTransitions)]).toEqual(["fade"]);
  expect(outcome).toBeVisible();
  expect([...new Set(reduceMotionOfAnimations())]).toEqual([
    ReduceMotion.Always,
  ]);
});
