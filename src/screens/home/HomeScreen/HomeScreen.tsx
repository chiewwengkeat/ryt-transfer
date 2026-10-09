import { router, Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  useGetTransferLimits,
  useTransferLimitsMaintenance,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import SectionRecentRecipients from "@/domains/transfer/components/SectionRecentRecipients/SectionRecentRecipients";
import { useBalanceScenarios } from "@/domains/transfer/hooks/use-balance-scenarios/use-balance-scenarios";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import { APP_LANGUAGE_NAMES, AppLanguage } from "@/shared/i18n/i18n";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { useIsOffline } from "@/shared/platform/offline/offline";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BottomSheetLanguage from "./components/BottomSheetLanguage/BottomSheetLanguage";
import SectionTransferNotices from "./components/SectionTransferNotices/SectionTransferNotices";

export default function HomeScreen() {
  const { t } = useTranslation("home");
  const balanceScenarios = useBalanceScenarios(
    TransferScenarioId.StartUnexpected,
  );
  return (
    <>
      <Stack.Screen
        options={{
          title: t("home.title"),
          headerRight: () => <ButtonLanguage />,
        }}
      />
      <ViewScreenFrame footer={<ButtonStartTransfer />}>
        <SectionTransferNotices />
        <CardBalance {...balanceScenarios} />
        <ButtonTransferHistory />
        <SectionRecentRecipientsHome />
      </ViewScreenFrame>
    </>
  );
}

function ButtonLanguage() {
  const { t, i18n } = useTranslation("home");
  const [sheetOpen, setSheetOpen] = useState(false);
  const shortName = (
    Object.entries(APP_LANGUAGE_NAMES).find(
      ([language]) => language === i18n.language,
    )?.[1] ?? APP_LANGUAGE_NAMES[AppLanguage.English]
  ).short;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        // Starts with the text on screen, so voice control can press the button by what it shows.
        accessibilityLabel={`${shortName}, ${t("button_language.label")}`}
        accessibilityLanguage={i18n.language}
        onPress={() => {
          setSheetOpen(true);
        }}
        style={({ pressed }) => [
          buttonLanguageStyles.button,
          pressed && buttonLanguageStyles.pressed,
        ]}
      >
        {/* The navigation bar never grows, so the label stops at what it holds. */}
        <Text maxFontSizeMultiplier={1.5} style={buttonLanguageStyles.label}>
          {shortName}
        </Text>
      </Pressable>
      {sheetOpen && (
        <BottomSheetLanguage
          onClose={() => {
            setSheetOpen(false);
          }}
        />
      )}
    </>
  );
}

const buttonLanguageStyles = StyleSheet.create({
  button: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  pressed: { opacity: 0.6 },
  label: { ...typography.label, color: colors.accent },
});

function ButtonStartTransfer() {
  const { t } = useTranslation("home");
  const disabledReason = useStartTransferDisabledReason();

  return (
    <ButtonPrimary
      label={t("home.transfer")}
      disabledReason={disabledReason}
      onPress={() => {
        router.push("/transfer");
      }}
    />
  );
}

function ButtonTransferHistory() {
  const { t } = useTranslation("home");
  return (
    <ButtonSecondary
      label={t("home.transfer_history")}
      onPress={() => {
        router.push("/transfer-history");
      }}
    />
  );
}

function SectionRecentRecipientsHome() {
  const { t } = useTranslation("transfer");
  const recents = useListRecentRecipients();
  // The shell's offline notice already explains a list that cannot load.
  const offline = useIsOffline();
  const startTransferDisabledReason = useStartTransferDisabledReason();

  return (
    <>
      {recents.isError && !offline && (
        <BannerAction
          tone="negative"
          announce={!isSessionEndFailure(recents.error)}
          message={t("common.start_unexpected.body")}
          action={{
            label: t("common.start_unexpected.retry"),
            onPress: () => {
              void recents.refetch();
            },
          }}
        />
      )}
      <SectionRecentRecipients
        disabledReason={startTransferDisabledReason}
        onRecentChosen={(recentId) => {
          router.push({ pathname: "/transfer", params: { recentId } });
        }}
      />
    </>
  );
}

function useStartTransferDisabledReason() {
  const { t } = useTranslation(["transfer", "shared"]);
  const offline = useIsOffline();
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();
  const maintenance = useTransferLimitsMaintenance(limits);

  return offline
    ? t("common.offline.disabled_reason")
    : maintenance?.until !== undefined
      ? t("common.under_maintenance.until", {
          time: formatMalaysianDateTime(maintenance.until, t),
        })
      : maintenance !== undefined
        ? t("common.under_maintenance.body")
        : account.isSuccess && limits.isSuccess
          ? undefined
          : t("common.balance_unavailable.disabled_reason");
}
