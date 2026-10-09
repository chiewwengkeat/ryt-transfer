import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, StyleSheet, View } from "react-native";

import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferOptions,
  isSettledTransferOutcome,
  outcomeOfTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { listPendingTransfers } from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { reportError } from "@/shared/observability/observability";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import TextBody from "@/shared/ui/TextBody/TextBody";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";

interface Props {
  onSignIn: () => void;
}
export default function ViewSessionEnded({ onSignIn }: Props) {
  const { t } = useTranslation();
  useTrackScenarioShown(TransferScenarioId.SessionEnded);
  // The app behind is hidden, so Back would move it where nobody can see.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <ViewMessage
        fullScreen
        title={t("view_session_ended.title")}
        message={t("view_session_ended.body")}
        actions={
          <>
            <TextLastTransferReference />
            <ButtonPrimary
              label={t("view_session_ended.sign_in")}
              onPress={onSignIn}
            />
          </>
        }
      />
    </View>
  );
}

function TextLastTransferReference() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const [reference, setReference] = useState<string>();

  useEffect(() => {
    // From the cache only: with the session ended, every request answers 401.
    const customerId = queryClient.getQueryData(
      getPrimaryAccountOptions().queryKey,
    )?.customerId;
    if (customerId === undefined) return;
    listPendingTransfers(customerId)
      .then((records) => {
        const [lastChecked] = records
          .map((record) => ({
            ...record,
            transfer: queryClient.getQueryData(
              getTransferOptions(record.transferId).queryKey,
            ),
          }))
          // A record can outlast its check: one whose money the bank has confirmed is not being checked.
          .filter(
            ({ transfer }) =>
              !isSettledTransferOutcome(
                transfer && outcomeOfTransfer(transfer),
              ),
          )
          .sort(
            (newer, older) =>
              Date.parse(older.createdAt) - Date.parse(newer.createdAt),
          );
        if (lastChecked)
          setReference(
            lastChecked.reference ??
              lastChecked.transfer?.reference ??
              lastChecked.transferId,
          );
      })
      .catch((error: unknown) => {
        reportError(error, { boundary: "session_ended_reference" });
      });
  }, [queryClient]);

  return (
    reference !== undefined && (
      <TextBody tone="secondary">
        {t("common.session_ended.reference", { reference })}
      </TextBody>
    )
  );
}
