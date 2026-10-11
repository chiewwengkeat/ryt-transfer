import { ApprovalDemoPinContext } from "@/domains/approval/lib/approval-demo-pin/approval-demo-pin";
import {
  ApprovalPinSheetStep,
  approvalPinSheetStore,
} from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import { useIsOffline } from "@/shared/http/offline/offline";
import { addUnauthorizedListener } from "@/shared/http/transport/transport";
import { enableObscuredTouchGuard } from "@/shared/platform/obscured-touch-guard/obscured-touch-guard";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { use, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import KeypadPin from "./components/KeypadPin/KeypadPin";

export default function BottomSheetPin() {
  const { t } = useTranslation("transfer");
  const [pin, setPin] = useState("");
  const [isTouchDropped, setIsTouchDropped] = useState(false);

  const sheet = useStore(approvalPinSheetStore);
  const isOffline = useIsOffline();
  const demoPin = use(ApprovalDemoPinContext);

  const isPinSheetShown = sheet.step !== ApprovalPinSheetStep.Closed;
  const isPinLocked = sheet.step === ApprovalPinSheetStep.PinLocked;
  const isSending = sheet.step === ApprovalPinSheetStep.Sending;
  const reasonApproveDisabled = (() => {
    if (isSending) return undefined;
    if (isOffline) return t("common.offline.notice");
    if (pin.length < APPROVAL_PIN_LENGTH)
      return t("bottom_sheet_pin.enter_every_digit", {
        length: APPROVAL_PIN_LENGTH,
      });
    return undefined;
  })();

  // Only review going away answers as the person closing the sheet would: an ended session closes it too, but has a report of its own.
  useEffect(() => {
    const answerShownSheetAsClosed = (closedAnswer: null | undefined) => {
      const shown = approvalPinSheetStore.getState();
      if (shown.step !== ApprovalPinSheetStep.Closed)
        shown.answer(closedAnswer);
    };
    const removeUnauthorizedListener = addUnauthorizedListener(() => {
      answerShownSheetAsClosed(undefined);
    });
    return () => {
      removeUnauthorizedListener();
      answerShownSheetAsClosed(null);
      // A sending sheet ignores the answer, and review opened afresh must not find it still open.
      approvalPinSheetStore.setState(
        approvalPinSheetStore.getInitialState(),
        true,
      );
    };
  }, []);
  // Mounted between showings, so the digits and a dropped touch end with each one.
  useEffect(() => {
    if (!isPinSheetShown) return;
    const disableObscuredTouchGuard = enableObscuredTouchGuard(() => {
      setIsTouchDropped(true);
    });
    return () => {
      disableObscuredTouchGuard();
      setIsTouchDropped(false);
      setPin("");
    };
  }, [isPinSheetShown]);

  if (!isPinSheetShown) return null;

  return (
    <BottomSheetFrame
      title={t(
        isPinLocked
          ? "bottom_sheet_pin.title_locked"
          : "bottom_sheet_pin.title",
      )}
      closeLabel={t("bottom_sheet_pin.close")}
      dismissable={!isSending}
      onClose={() => {
        sheet.answer(null);
      }}
    >
      {isPinLocked ? (
        <BannerNotice tone="negative" message={sheet.message} />
      ) : (
        <TextBody>{sheet.message}</TextBody>
      )}
      {sheet.detail !== undefined && <TextBody>{sheet.detail}</TextBody>}
      {sheet.refusal !== undefined && (
        <BannerNotice tone="negative" message={sheet.refusal} />
      )}
      {isTouchDropped && (
        <BannerNotice message={t("bottom_sheet_pin.touch_dropped")} />
      )}
      {!isPinLocked && (
        <>
          {demoPin !== undefined && (
            <TextBody tone="secondary">
              {t("bottom_sheet_pin.demo_pin", { pin: demoPin })}
            </TextBody>
          )}
          <KeypadPin
            pinLength={APPROVAL_PIN_LENGTH}
            digitsEntered={pin.length}
            disabled={isSending}
            onPressDigit={(digit) => {
              setIsTouchDropped(false);
              setPin((typed) => (typed + digit).slice(0, APPROVAL_PIN_LENGTH));
            }}
            onPressDelete={() => {
              setIsTouchDropped(false);
              setPin((typed) => typed.slice(0, -1));
            }}
          />
          <ButtonPrimary
            label={t("bottom_sheet_pin.approve")}
            loading={isSending}
            disabledReason={reasonApproveDisabled}
            onPress={() => {
              sheet.answer(pin);
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
