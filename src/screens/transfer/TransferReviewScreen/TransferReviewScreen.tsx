import BannerEarlierTransferUnconfirmed from "@/domains/transfer/components/BannerEarlierTransferUnconfirmed/BannerEarlierTransferUnconfirmed";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import BannerFlowNotice from "@/screens/transfer/components/BannerFlowNotice/BannerFlowNotice";
import {
  TransferFlowStep,
  transferFlowStore,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import { refreshAccountHistoryAndRecentRecipientsAfterApproval } from "@/screens/transfer/lib/refresh-after-approval/refresh-after-approval";
import { useInitialValue } from "@/shared/hooks/use-initial-value/use-initial-value";
import TextBody from "@/shared/ui/TextBody/TextBody";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import BottomSheetPin from "./components/BottomSheetPin/BottomSheetPin";
import ButtonConfirmTransfer from "./components/ButtonConfirmTransfer/ButtonConfirmTransfer";
import HeaderReview from "./components/HeaderReview/HeaderReview";
import SectionReviewDetails from "./components/SectionReviewDetails/SectionReviewDetails";

export default function TransferReviewScreen() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  // Review shows, and the phone signs, the draft it opened with; the steps behind it cannot change it meanwhile.
  const draft = useInitialValue(() => {
    const flow = transferFlowStore.getState();
    if (flow.step !== TransferFlowStep.Reviewing)
      throw new Error(`Review opened while the transfer was ${flow.step}.`);
    return flow.draft;
  });

  const isPhoneRefused = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Reviewing &&
      flow.notice === TransferScenarioId.RootedPhone,
  );
  // Through Done as well: review stays drawn until the result page covers it.
  const isApprovalSent = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Submitting ||
      flow.step === TransferFlowStep.Done,
  );

  return (
    <>
      <HeaderReview />
      <ViewScreenFrame
        footer={
          // A refused phone sees the refusal alone, in Transfer's place: nothing beside it may offer a way to approve.
          isPhoneRefused ? (
            <BannerFlowNotice step={TransferFlowStep.Reviewing} />
          ) : (
            <ButtonConfirmTransfer draft={draft} />
          )
        }
      >
        {!isPhoneRefused && (
          <BannerEarlierTransferUnconfirmed
            onEarlierTransferSettled={() => {
              void refreshAccountHistoryAndRecentRecipientsAfterApproval(
                queryClient,
              );
            }}
          />
        )}
        <SectionReviewDetails draft={draft} />
        {isApprovalSent && (
          <TextBody>{t("common.biometrics_recognised.body")}</TextBody>
        )}
        {!isPhoneRefused && (
          <BannerFlowNotice step={TransferFlowStep.Reviewing} />
        )}
      </ViewScreenFrame>
      <BottomSheetPin />
    </>
  );
}
