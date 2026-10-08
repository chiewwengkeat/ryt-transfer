import { useEffect } from "react";
import { useStore } from "zustand";

import BottomSheetPin from "@/domains/approval/components/BottomSheetPin/BottomSheetPin";
import {
  ApprovalPinSheetStep,
  approvalPinSheetStore,
} from "@/domains/approval/hooks/approval-pin-sheet";
import { addUnauthorizedListener } from "@/shared/http/transport";

export default function ViewPinSheetHost() {
  const pinSheet = useStore(approvalPinSheetStore);
  // An ended session closes the sheet with its flow, as closing it by hand would.
  useEffect(
    () =>
      addUnauthorizedListener(() => {
        const shown = approvalPinSheetStore.getState();
        if (shown.step !== ApprovalPinSheetStep.Closed) shown.answer(null);
      }),
    [],
  );
  // Nothing else resets the store, so a root mounted afresh must not find an earlier sheet still open.
  useEffect(
    () => () => {
      approvalPinSheetStore.setState(
        approvalPinSheetStore.getInitialState(),
        true,
      );
    },
    [],
  );

  if (pinSheet.step === ApprovalPinSheetStep.Closed) return null;
  return (
    <BottomSheetPin
      message={pinSheet.message}
      detail={pinSheet.detail}
      refusal={pinSheet.refusal}
      pinLocked={pinSheet.step === ApprovalPinSheetStep.PinLocked}
      sending={pinSheet.step === ApprovalPinSheetStep.Sending}
      onSubmitPin={pinSheet.answer}
      onClose={() => {
        pinSheet.answer(null);
      }}
    />
  );
}
