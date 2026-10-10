import { fireEvent, screen } from "@testing-library/react-native";

export async function pressEveryRecentRecipientExpectingItDisabled() {
  for (const recent of await screen.findAllByRole("button", { name: /••••/ })) {
    expect(recent).toBeDisabled();
    await fireEvent.press(recent);
  }
}
