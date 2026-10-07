import { fireEvent, render, screen } from "@testing-library/react-native";

import ButtonPrimary from "./ButtonPrimary";

it("acts on a press", async () => {
  const onPress = jest.fn();
  await render(<ButtonPrimary label="Continue" onPress={onPress} />);

  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

it("says why it is disabled, on screen and to a screen reader, and ignores a press", async () => {
  const onPress = jest.fn();
  await render(
    <ButtonPrimary
      label="Continue"
      onPress={onPress}
      disabledReason="Enter an amount first"
    />,
  );
  const button = screen.getByRole("button", { name: "Continue" });

  await fireEvent.press(button);

  expect(button).toBeDisabled();
  expect(screen.getByHintText("Enter an amount first")).toBe(button);
  expect(screen.getByText("Enter an amount first")).toBeOnTheScreen();
  expect(onPress).not.toHaveBeenCalled();
});

it("shows it is busy while loading, keeps its name, and ignores a press", async () => {
  const onPress = jest.fn();
  await render(<ButtonPrimary label="Send" onPress={onPress} loading />);
  const button = screen.getByRole("button", { name: "Send" });

  await fireEvent.press(button);

  expect(button).toBeBusy();
  expect(onPress).not.toHaveBeenCalled();
});
