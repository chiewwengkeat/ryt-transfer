import { waitFor } from "@testing-library/react-native";

import type * as ApprovalKeys from "@/domains/approval/hooks/approval-keys";
import type * as SecureStorage from "@/shared/platform/secure-storage";
import {
  deviceIntegrityChecksAsked,
  phoneKeyOptions,
} from "@/test/biometrics-double";
import {
  appSwitcherBlurIntensity,
  isScreenCaptureBlocked,
  kvStoreDouble,
} from "@/test/harness/native-doubles";

// Built out here, so the isolated launch below shares these doubles instead of building its own.
jest.requireMock("@sbaiahmed1/react-native-biometrics");
jest.requireMock("expo-sqlite/kv-store");

// ⛔ First in the file: any later test reads the shared reset, not what the launch did.
it("blocks capture, blurs the iPhone's app switcher at the default strength, and asks the phone check once, at launch", () => {
  expect(isScreenCaptureBlocked()).toBe(true);
  expect(appSwitcherBlurIntensity()).toBe(0.5);
  expect(deviceIntegrityChecksAsked()).toBe(1);
});

it("forgets the approval keys a reinstalled app finds left from before", async () => {
  kvStoreDouble.removeItemSync("install-marker");
  await jest.isolateModulesAsync(async () => {
    const approvalKeys = jest.requireActual<typeof ApprovalKeys>(
      "@/domains/approval/hooks/approval-keys",
    );
    await approvalKeys.createApprovalKeys();
    await approvalKeys.saveApprovalKeyIds({
      possessionKeyId: "key_possession",
      biometricKeyId: "key_biometric",
    });

    jest.requireActual("@/shell/app-launch");
    await waitFor(() => {
      expect(kvStoreDouble.getItemSync("install-marker")).not.toBeNull();
    });

    expect(await approvalKeys.hasApprovalKeysOnFile()).toBe(false);
    expect(phoneKeyOptions()).toEqual([]);
  });
});

it("keeps the approval keys when the app was not reinstalled", async () => {
  kvStoreDouble.setItemSync("install-marker", "2026-10-01T00:00:00.000Z");
  await jest.isolateModulesAsync(async () => {
    const approvalKeys = jest.requireActual<typeof ApprovalKeys>(
      "@/domains/approval/hooks/approval-keys",
    );
    const { writeSecureRecord } = jest.requireActual<typeof SecureStorage>(
      "@/shared/platform/secure-storage",
    );
    await approvalKeys.createApprovalKeys();
    await approvalKeys.saveApprovalKeyIds({
      possessionKeyId: "key_possession",
      biometricKeyId: "key_biometric",
    });

    jest.requireActual("@/shell/app-launch");
    // Storage runs writes and wipes in the order asked, so this settles only after any wipe the launch asked for.
    await writeSecureRecord({ namespace: "test", name: "launch-settled" }, "");

    expect(await approvalKeys.hasApprovalKeysOnFile()).toBe(true);
    expect(phoneKeyOptions()).toHaveLength(2);
  });
});
