import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import FieldText from "./FieldText";

afterEach(() => {
  jest.restoreAllMocks();
});

it("hands typed text to its owner", async () => {
  const onChangeText = jest.fn();
  await render(
    <FieldText label="Account number" value="" onChangeText={onChangeText} />,
  );

  await fireEvent.changeText(screen.getByLabelText("Account number"), "1234");

  expect(onChangeText).toHaveBeenCalledWith("1234");
});

it("shows its error and announces it to a screen reader", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  await render(
    <FieldText
      label="Account number"
      value="12"
      onChangeText={jest.fn()}
      error="Enter all 12 digits"
    />,
  );

  expect(screen.getByText("Enter all 12 digits")).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledWith("Enter all 12 digits");
});

it("passes the keyboard's learning settings through to the input", async () => {
  await render(
    <FieldText
      label="Account number"
      value=""
      onChangeText={jest.fn()}
      autoCorrect={false}
      autoComplete="off"
    />,
  );

  expect(screen.getByLabelText("Account number")).toHaveProp(
    "autoCorrect",
    false,
  );
  expect(screen.getByLabelText("Account number")).toHaveProp(
    "autoComplete",
    "off",
  );
});
