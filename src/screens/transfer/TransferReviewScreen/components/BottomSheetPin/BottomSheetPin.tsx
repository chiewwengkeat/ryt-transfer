import { ApprovalDemoPinContext } from "@/domains/approval/lib/approval-demo-pin/approval-demo-pin";
import { useIsOffline } from "@/shared/http/offline/offline";
import { enableObscuredTouchGuard } from "@/shared/platform/obscured-touch-guard/obscured-touch-guard";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { use, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import KeypadPin from "./components/KeypadPin/KeypadPin";

interface Props {
  message: string;
  detail?: string;
  refusal?: string;
  pinLocked: boolean;
  sending: boolean;
  onSubmitPin: (pin: string) => void;
  onClose: () => void;
}
export default function BottomSheetPin({
  message,
  detail,
  refusal,
  pinLocked,
  sending,
  onSubmitPin,
  onClose,
}: Props) {
  const { t } = useTranslation("transfer");
  const [pin, setPin] = useState("");
  const [touchDropped, setTouchDropped] = useState(false);
  const offline = useIsOffline();
  const demoPin = use(ApprovalDemoPinContext);
  useEffect(
    () =>
      enableObscuredTouchGuard(() => {
        setTouchDropped(true);
      }),
    [],
  );

  const approveDisabledReason = sending
    ? undefined
    : offline
      ? t("common.offline.notice")
      : pin.length < APPROVAL_PIN_LENGTH
        ? t("bottom_sheet_pin.enter_every_digit", {
            length: APPROVAL_PIN_LENGTH,
          })
        : undefined;

  return (
    <BottomSheetFrame
      title={t(
        pinLocked ? "bottom_sheet_pin.title_locked" : "bottom_sheet_pin.title",
      )}
      closeLabel={t("bottom_sheet_pin.close")}
      dismissable={!sending}
      onClose={onClose}
    >
      {pinLocked ? (
        <BannerNotice tone="negative" message={message} />
      ) : (
        <TextBody>{message}</TextBody>
      )}
      {detail !== undefined && <TextBody>{detail}</TextBody>}
      {refusal !== undefined && (
        <BannerNotice tone="negative" message={refusal} />
      )}
      {touchDropped && (
        <BannerNotice message={t("bottom_sheet_pin.touch_dropped")} />
      )}
      {!pinLocked && (
        <>
          {demoPin !== undefined && (
            <TextBody tone="secondary">
              {t("bottom_sheet_pin.demo_pin", { pin: demoPin })}
            </TextBody>
          )}
          <KeypadPin
            pinLength={APPROVAL_PIN_LENGTH}
            digitsEntered={pin.length}
            disabled={sending}
            onPressDigit={(digit) => {
              setTouchDropped(false);
              setPin((typed) => (typed + digit).slice(0, APPROVAL_PIN_LENGTH));
            }}
            onPressDelete={() => {
              setTouchDropped(false);
              setPin((typed) => typed.slice(0, -1));
            }}
          />
          <ButtonPrimary
            label={t("bottom_sheet_pin.approve")}
            loading={sending}
            disabledReason={approveDisabledReason}
            onPress={() => {
              onSubmitPin(pin);
              setPin("");
            }}
          />
        </>
      )}
    </BottomSheetFrame>
  );
}

// ⛔ Length only: the bank alone checks the PIN itself and limits the tries.
const APPROVAL_PIN_LENGTH = 6;
