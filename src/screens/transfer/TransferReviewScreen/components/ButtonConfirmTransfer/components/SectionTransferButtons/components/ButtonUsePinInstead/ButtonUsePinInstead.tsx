import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import {
  BiometricSignOutcome,
  readBiometricSensorRefusal,
} from "@/domains/approval/lib/approval-keys/approval-keys";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState } from "react-native";
import { useStore } from "zustand";

interface Props {
  pinTryAvailable: boolean;
  onPress: () => void;
}
export default function ButtonUsePinInstead({
  pinTryAvailable,
  onPress,
}: Props) {
  const { t } = useTranslation("transfer");
  const [isBiometricSensorUnavailable, setIsBiometricSensorUnavailable] =
    useState(false);

  const isBiometricApprovalOn = useStore(
    approvalSettingsStore,
    (settings) => settings.biometricApprovalOn,
  );

  useEffect(() => {
    let isMounted = true;
    const checkBiometricSensor = () => {
      void readBiometricSensorRefusal().then((refusal) => {
        if (isMounted)
          setIsBiometricSensorUnavailable(
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
      isMounted = false;
      subscription.remove();
    };
  }, []);

  // Transfer asks for the PIN itself while face or fingerprint approval is off or unavailable.
  if (
    !pinTryAvailable ||
    !isBiometricApprovalOn ||
    isBiometricSensorUnavailable
  )
    return null;

  return (
    <ButtonSecondary label={t("common.pin_chosen.choose")} onPress={onPress} />
  );
}
