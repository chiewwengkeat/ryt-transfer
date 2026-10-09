import { useEffect } from "react";
import { useStore } from "zustand";

import BottomSheetPin from "./components/BottomSheetPin/BottomSheetPin";
import {
  ApprovalPinSheetStep,
  approvalPinSheetStore,
} from "@/domains/approval/hooks/approval-pin-sheet";
import { addUnauthorizedListener } from "@/shared/http/transport";

export default function ViewPinSheetHost() {
  const pinSheet = useStore(approvalPinSheetStore);
  // An ended session or a root going away closes the sheet with its flow; only the root's going away answers as the
  // person closing it would, since the session's end has a report of its own.
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
