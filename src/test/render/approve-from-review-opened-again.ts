import { fireEvent, screen } from "@testing-library/react-native";

export async function approveFromReviewOpenedAgain() {
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");
}
