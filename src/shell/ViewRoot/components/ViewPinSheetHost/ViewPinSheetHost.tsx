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
  // An ended session or a root going away closes the sheet with its flow, as closing it by hand would.
  useEffect(() => {
    const answerShownSheetAsClosed = () => {
      const shown = approvalPinSheetStore.getState();
      if (shown.step !== ApprovalPinSheetStep.Closed) shown.answer(null);
    };
    const removeUnauthorizedListener = addUnauthorizedListener(
      answerShownSheetAsClosed,
    );
    return () => {
      removeUnauthorizedListener();
      answerShownSheetAsClosed();
      // A sending sheet ignores the answer, and a root mounted afresh must not find it still open.
      approvalPinSheetStore.setState(
        approvalPinSheetStore.getInitialState(),
        true,
      );
    };
  }, []);

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
