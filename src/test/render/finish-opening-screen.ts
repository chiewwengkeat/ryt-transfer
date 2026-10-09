import { fireEvent } from "@testing-library/react-native";

// Jest plays no screen transitions. "appear" from any element inside bubbles to its native screen as the phone's signal.
export async function finishOpeningScreen(
  elementOnTheScreen: Parameters<typeof fireEvent>[0],
) {
  await fireEvent(elementOnTheScreen, "appear");
}
