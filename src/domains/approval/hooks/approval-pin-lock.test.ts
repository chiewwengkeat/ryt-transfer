import { act, renderHook, waitFor } from "@testing-library/react-native";

import { secureStoreNativeDouble } from "@/test/harness/native-doubles";

import {
  forgetApprovalPinLock,
  isApprovalPinLocked,
  rememberApprovalPinLocked,
  useApprovalPinLocked,
} from "./approval-pin-lock";

it("reads a lock the bank set before the reader mounted", async () => {
  await rememberApprovalPinLocked();

  const { result } = await renderHook(useApprovalPinLocked);

  await waitFor(() => expect(result.current).toBe(true));
});

it("follows the bank's lock and the reset that lifts it while mounted", async () => {
  const { result } = await renderHook(useApprovalPinLocked);

  await act(() => rememberApprovalPinLocked());
  const lockedOnceRefused = result.current;
  await act(() => forgetApprovalPinLock());

  expect(lockedOnceRefused).toBe(true);
  expect(result.current).toBe(false);
});

it("agrees with the approve path when the phone could not keep the lock", async () => {
  jest
    .spyOn(secureStoreNativeDouble, "setValueWithKeyAsync")
    .mockRejectedValueOnce(new Error("the phone died"));
  const { result } = await renderHook(useApprovalPinLocked);

  await act(() => rememberApprovalPinLocked());

  expect(await isApprovalPinLocked()).toBe(false);
  expect(result.current).toBe(false);
});
