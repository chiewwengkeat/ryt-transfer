import { fireEvent, screen } from "@testing-library/react-native";

export async function enterTransferRecipientAndAmount() {
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
}

export async function walkToTransferReview({ note }: { note?: string } = {}) {
  await enterTransferRecipientAndAmount();
  if (note !== undefined)
    await fireEvent.changeText(screen.getByLabelText("Note (optional)"), note);
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
}
