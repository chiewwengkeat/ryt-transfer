import { useState } from "react";
import { useTranslation } from "react-i18next";

import BannerEarlierTransferUnconfirmed from "@/domains/transfer/components/BannerEarlierTransferUnconfirmed/BannerEarlierTransferUnconfirmed";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BannerFlowNotice from "../components/BannerFlowNotice/BannerFlowNotice";
import { TransferFlowStep, transferFlowStore } from "../state/transfer-flow";
import ButtonConfirmTransfer from "./components/ButtonConfirmTransfer/ButtonConfirmTransfer";
import HeaderReview from "./components/HeaderReview/HeaderReview";
import SectionReviewDetails from "./components/SectionReviewDetails/SectionReviewDetails";
import TextSendingTransfer from "./components/TextSendingTransfer/TextSendingTransfer";

export default function TransferReviewScreen() {
  const { t } = useTranslation("transfer");
  // Review shows, and the phone signs, the draft it opened with; the steps behind it cannot change it meanwhile.
  const [draft] = useState(() => {
    const flow = transferFlowStore.getState();
    if (flow.step !== TransferFlowStep.Reviewing)
      throw new Error(`Review opened while the transfer was ${flow.step}.`);
    return flow.draft;
  });
  // A refused phone sees the refusal alone: no Transfer button, and no earlier notice that offers the PIN.
  const [phoneRefused, setPhoneRefused] = useState(false);

  return (
    <>
      <HeaderReview />
      <ViewScreenFrame
        footer={
          phoneRefused ? (
            <BannerNotice
              tone="negative"
              message={t("common.rooted_phone.body")}
            />
          ) : (
            <ButtonConfirmTransfer
              draft={draft}
              onPhoneRefused={() => {
                setPhoneRefused(true);
              }}
            />
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
