import { act } from "@testing-library/react-native";

// Longer than a receipt takes to lift the block: a receipt test's waitFor would give up first, after 1 s.
export async function waitPastReceiptSettle() {
  await act(() => {
    jest.advanceTimersByTime(1_000);
  });
}
