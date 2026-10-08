import { screen } from "@testing-library/react-native";

export function pressHandlerOf(element: ReturnType<typeof screen.getByRole>) {
  // A host element carries no onPress: the component that handles the press sits above it.
  for (
    let fiber: PressFiber | null = (
      element as unknown as { unstable_fiber: PressFiber }
    ).unstable_fiber;
    fiber !== null;
    fiber = fiber.return
  ) {
    const onPress = fiber.memoizedProps?.onPress;
    if (typeof onPress === "function") return onPress as () => void;
  }
  throw new Error("Nothing handles a press on this element.");
}

type PressFiber = {
  memoizedProps: { onPress?: unknown } | null;
  return: PressFiber | null;
};
