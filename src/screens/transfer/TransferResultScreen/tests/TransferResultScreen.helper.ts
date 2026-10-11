import { walkToTransferReview } from "@/test/render/drive-app";
import { fireEvent, screen } from "@testing-library/react-native";

export async function sendRm100FromHome() {
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  );
  await walkToTransferReview();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
}

export function transferIdIn(pathname: string | undefined) {
  return pathname?.replace("/transfer/result/", "") ?? "";
}

// The page's only offers: anything more could be a way to send the money twice.
export function buttonsOnTheResultPage() {
  return screen
    .getAllByRole("button")
    .map((button) => button.props.accessibilityLabel as unknown);
}
