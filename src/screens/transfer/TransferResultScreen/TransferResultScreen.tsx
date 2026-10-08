import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { useGetTransfer } from "@/domains/transfer/api/get-transfer/get-transfer";
import { TransferStatus } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { formatMoney } from "@/shared/lib/money/money";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import Loader from "@/shared/ui/Loader/Loader";
import TextBody from "@/shared/ui/TextBody/TextBody";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import SectionTransferDetails from "../components/SectionTransferDetails/SectionTransferDetails";

export default function TransferResultScreen() {
  const { t } = useTranslation("transfer");
  const { transferId } = useLocalSearchParams<{ transferId: string }>();
  const transfer = useGetTransfer(transferId);
  const completedTransfer =
    transfer.data?.status === TransferStatus.Completed
      ? transfer.data
      : undefined;

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
        {transfer.isPending && <Loader />}
        {completedTransfer && (
          <>
            <TextHeading autoFocus>{t("common.completed.title")}</TextHeading>
            <TextBody>
              {t("common.completed.body", {
                amount: formatMoney(completedTransfer.amount),
                name: completedTransfer.counterparty.registeredName,
              })}
            </TextBody>
            <SectionTransferDetails transfer={completedTransfer} />
          </>
        )}
        {(transfer.isError || (transfer.data && !completedTransfer)) && (
          <BannerNotice
            tone="negative"
            message={t("common.outcome_unexpected.body")}
          />
        )}
        {transfer.isError && (
          <ButtonSecondary
            label={t("common.outcome_unexpected.retry")}
            onPress={() => {
              void transfer.refetch();
            }}
          />
        )}
      </ViewScreenFrame>
    </>
  );
}
