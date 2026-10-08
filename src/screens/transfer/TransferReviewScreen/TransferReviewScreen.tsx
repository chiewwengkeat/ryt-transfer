import { useState } from "react";

import BannerEarlierTransferUnconfirmed from "@/domains/transfer/components/BannerEarlierTransferUnconfirmed/BannerEarlierTransferUnconfirmed";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BannerFlowNotice from "../components/BannerFlowNotice/BannerFlowNotice";
import {
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
  useTransferFlow,
} from "../state/transfer-flow";
import ButtonConfirmTransfer from "./components/ButtonConfirmTransfer/ButtonConfirmTransfer";
import HeaderReview from "./components/HeaderReview/HeaderReview";
import SectionReviewDetails from "./components/SectionReviewDetails/SectionReviewDetails";
import TextSendingTransfer from "./components/TextSendingTransfer/TextSendingTransfer";

export default function TransferReviewScreen() {
  // Review shows, and the phone signs, the draft it opened with; the steps behind it cannot change it meanwhile.
  const [draft] = useState(() => {
    const flow = transferFlowStore.getState();
    if (flow.step !== TransferFlowStep.Reviewing)
      throw new Error(`Review opened while the transfer was ${flow.step}.`);
    return flow.draft;
  });
  const phoneRefused = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Reviewing &&
      flow.notice === TransferFlowScenario.RootedPhone,
  );

  return (
    <>
      <HeaderReview />
      <ViewScreenFrame
        footer={
          // A refused phone sees the refusal alone, in Transfer's place: nothing beside it may offer a way to approve.
          phoneRefused ? (
            <BannerFlowNotice step={TransferFlowStep.Reviewing} />
          ) : (
            <ButtonConfirmTransfer draft={draft} />
          )
        }
      >
        <BannerEarlierTransferUnconfirmed />
        <SectionReviewDetails draft={draft} />
        <TextSendingTransfer />
        {!phoneRefused && (
          <BannerFlowNotice step={TransferFlowStep.Reviewing} />
        )}
      </ViewScreenFrame>
    </>
  );
}
