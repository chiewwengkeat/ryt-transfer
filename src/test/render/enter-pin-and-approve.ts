import { fireEvent, screen } from "@testing-library/react-native";

export async function enterPinAndApprove(pin: string) {
  for (const digit of pin)
    await fireEvent.press(await screen.findByRole("button", { name: digit }));
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
}
