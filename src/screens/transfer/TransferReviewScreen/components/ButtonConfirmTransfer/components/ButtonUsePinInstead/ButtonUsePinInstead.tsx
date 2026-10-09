import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState } from "react-native";
import { useStore } from "zustand";

import {
  BiometricSignOutcome,
  readBiometricSensorRefusal,
} from "@/domains/approval/lib/approval-keys/approval-keys";
import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

interface Props {
  pinTryAvailable: boolean;
  onPress: () => void;
}
export default function ButtonUsePinInstead({
  pinTryAvailable,
  onPress,
}: Props) {
  const { t } = useTranslation("transfer");
  const biometricApprovalOn = useStore(
    approvalSettingsStore,
    (settings) => settings.biometricApprovalOn,
  );
  const [biometricSensorUnavailable, setBiometricSensorUnavailable] =
    useState(false);
  useEffect(() => {
    let mounted = true;
    const checkBiometricSensor = () => {
      void readBiometricSensorRefusal().then((refusal) => {
        if (mounted)
          setBiometricSensorUnavailable(
            refusal?.outcome === BiometricSignOutcome.NotSetUp ||
              refusal?.outcome === BiometricSignOutcome.NoSensor,
          );
      });
    };
    checkBiometricSensor();
    // Enrolment changes in the phone's own settings, so it is asked again whenever the app comes back.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") checkBiometricSensor();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  // Transfer asks for the PIN itself while face or fingerprint approval is off or unavailable.
  if (!pinTryAvailable || !biometricApprovalOn || biometricSensorUnavailable)
    return null;
  return (
    <ButtonSecondary label={t("common.pin_chosen.choose")} onPress={onPress} />
  );
}
