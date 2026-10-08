import { useState } from "react";

import BannerEarlierTransferUnconfirmed from "@/domains/transfer/components/BannerEarlierTransferUnconfirmed/BannerEarlierTransferUnconfirmed";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BannerFlowNotice from "../components/BannerFlowNotice/BannerFlowNotice";
import { TransferFlowStep, transferFlowStore } from "../state/transfer-flow";
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

  return (
    <>
      <HeaderReview />
      <ViewScreenFrame footer={<ButtonConfirmTransfer draft={draft} />}>
        <BannerEarlierTransferUnconfirmed />
        <SectionReviewDetails draft={draft} />
        <TextSendingTransfer />
        <BannerFlowNotice step={TransferFlowStep.Reviewing} />
      </ViewScreenFrame>
    </>
  );
}
