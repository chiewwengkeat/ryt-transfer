import { act, renderHook, waitFor } from "@testing-library/react-native";

import {
  forgetApprovalPinLock,
  isApprovalPinLocked,
  rememberApprovalPinLocked,
} from "@/domains/approval/hooks/approval-pin-lock";
import { secureStoreNativeDouble } from "@/test/harness/native-doubles";

import { useApprovalPinLocked } from "./use-approval-pin-locked";

it("reads a lock the bank set before the reader mounted", async () => {
  await rememberApprovalPinLocked();

  const { result } = await renderHook(useApprovalPinLocked);

  await waitFor(() => expect(result.current.pinLocked).toBe(true));
  expect(result.current.isPinLockedNow()).toBe(true);
});

it("follows the bank's lock and the reset that lifts it while mounted", async () => {
  const { result } = await renderHook(useApprovalPinLocked);

  await act(() => rememberApprovalPinLocked());
  const lockedOnceRefused = result.current.pinLocked;
  const lockedNowOnceRefused = result.current.isPinLockedNow();
  await act(() => forgetApprovalPinLock());

  expect(lockedOnceRefused).toBe(true);
  expect(lockedNowOnceRefused).toBe(true);
  expect(result.current.pinLocked).toBe(false);
  expect(result.current.isPinLockedNow()).toBe(false);
});

it("agrees with the approve path when the phone could not keep the lock", async () => {
  jest
    .spyOn(secureStoreNativeDouble, "setValueWithKeyAsync")
    .mockRejectedValueOnce(new Error("the phone died"));
  const { result } = await renderHook(useApprovalPinLocked);

  await act(() => rememberApprovalPinLocked());

  expect(await isApprovalPinLocked()).toBe(false);
  expect(result.current.pinLocked).toBe(false);
  expect(result.current.isPinLockedNow()).toBe(false);
});
