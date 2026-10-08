import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  TransferOutcomeScenario,
  useGetTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { GetTransferErrorCode } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import { trackEvent } from "@/shared/observability/observability";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import SectionTransferDetails from "../components/SectionTransferDetails/SectionTransferDetails";
import TextOutcome from "./components/TextOutcome/TextOutcome";

export default function TransferResultScreen() {
  const { t } = useTranslation("transfer");
  const { transferId, checking } = useLocalSearchParams<{
    transferId: string;
    checking?: string;
  }>();
  const transfer = useGetTransfer(transferId);
  // Opened without the approve call's answer in hand, nothing has confirmed what the approval did.
  const [checkingUnansweredApproval] = useState(
    () => checking !== undefined || transfer.dataUpdatedAt === 0,
  );

  const failure = transfer.error;
  const transferNotFound =
    failure instanceof TransportError &&
    failure.code === GetTransferErrorCode.TransferNotFound;
  // These never reached the bank, or the session view answers them: the transfer stands as last read.
  const bankUnreached =
    failure instanceof TransportError &&
    (failure.kind === TransportErrorKind.Network ||
      failure.kind === TransportErrorKind.Timeout ||
      failure.kind === TransportErrorKind.Aborted ||
      (failure.kind === TransportErrorKind.Http &&
        (failure.status === 401 || (failure.status ?? 0) >= 500)));
  const outcome = transfer.data?.outcome;
  // A later read that fails never hides an outcome the bank has already settled.
  const outcomeSettled =
    outcome !== undefined &&
    outcome !== null &&
    outcome !== TransferOutcomeScenario.Processing &&
    outcome !== TransferOutcomeScenario.HeldForReview;
  const scenario = outcomeSettled
    ? outcome
    : transferNotFound
      ? TransferOutcomeScenario.LastTransferNotFound
      : failure !== null && !bankUnreached
        ? checkingUnansweredApproval
          ? TransferOutcomeScenario.RecoveryUnexpected
          : TransferOutcomeScenario.OutcomeUnexpected
        : (outcome ??
          [
            TransferOutcomeScenario.ApprovalUnknownAnswer,
            TransferOutcomeScenario.AppClosedDuringApproval,
          ].find((reason) => reason === checking) ??
          TransferOutcomeScenario.ApprovalUnanswered);

  useEffect(() => {
    trackEvent("transfer_outcome", { scenario });
  }, [scenario]);

  return (
    <>
      <Stack.Screen options={{ title: t("result.title") }} />
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("result.done")}
            onPress={() => {
              router.dismissTo("/");
            }}
          />
        }
      >
        <TextOutcome
          scenario={scenario}
          transfer={transfer.data}
          transferId={transferId}
        />
        {scenario === TransferOutcomeScenario.Completed && transfer.data && (
          <SectionTransferDetails transfer={transfer.data} />
        )}
        {scenario === TransferOutcomeScenario.OutcomeUnexpected && (
          <ButtonSecondary
            label={t("common.outcome_unexpected.load_again")}
            onPress={() => {
              void transfer.refetch();
            }}
          />
        )}
      </ViewScreenFrame>
    </>
  );
}
