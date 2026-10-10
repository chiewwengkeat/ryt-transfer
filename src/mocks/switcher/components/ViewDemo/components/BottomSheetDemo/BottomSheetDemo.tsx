import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useStore } from "zustand";

import { notifyApprovalPinReset } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  clearTransferScenario,
  isDemoPinLocked,
  pickTransferScenario,
  resetDemoBank,
  unlockDemoPin,
} from "@/mocks/bank/bank";
import {
  TRANSFER_SCENARIOS,
  TransferStep,
  type TransferScenario,
} from "@/mocks/scenarios/transfer-scenarios/transfer-scenarios";
import { useDemoTranslation } from "@/mocks/switcher/components/ViewDemo/hooks/use-demo-translation/use-demo-translation";
import { switcherStore } from "@/mocks/switcher/switcher-store/switcher-store";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  onResetDemo: () => Promise<void>;
  onClose: () => void;
}
export default function BottomSheetDemo({ onResetDemo, onClose }: Props) {
  const { t, scenarioTitle } = useDemoTranslation();
  const activeScenarioId = useStore(switcherStore, (pick) => pick.scenarioId);
  const [demoPinLocked] = useState(isDemoPinLocked);

  return (
    <BottomSheetFrame
      title={t("bottom_sheet_demo.title")}
      closeLabel={t("bottom_sheet_demo.close")}
      onClose={onClose}
      footer={
        <ButtonSecondary
          label={t("bottom_sheet_demo.reset")}
          onPress={() => {
            onClose();
            void resetDemoBank().then(notifyApprovalPinReset).then(onResetDemo);
          }}
        />
      }
    >
      {demoPinLocked && (
        <>
          <TextBody strong>{t("bottom_sheet_demo.demo_only")}</TextBody>
          <TextBody tone="secondary">
            {t("bottom_sheet_demo.unlock_pin_note")}
          </TextBody>
          <ButtonSecondary
            label={t("bottom_sheet_demo.unlock_pin")}
            onPress={() => {
              unlockDemoPin();
              void notifyApprovalPinReset();
              onClose();
            }}
          />
        </>
      )}
      <ItemScenarioDemo
        label={t("bottom_sheet_demo.normal")}
        checked={activeScenarioId === null}
        onPress={() => {
          clearTransferScenario();
          onClose();
        }}
      />
      <ItemScenarioDemo
        label={t("bottom_sheet_demo.no_biometrics")}
        checked={activeScenarioId === TransferScenarioId.BiometricsUnavailable}
        onPress={() => {
          pickTransferScenario(TransferScenarioId.BiometricsUnavailable);
          onClose();
        }}
      />
      {PHONE_SIDE_SCENARIO_IDS.map((scenarioId) => (
        <ItemScenarioDemo
          key={scenarioId}
          label={scenarioTitle(scenarioId)}
          checked={activeScenarioId === scenarioId}
          onPress={() => {
            pickTransferScenario(scenarioId);
            onClose();
          }}
        />
      ))}
      {Object.values(TransferStep).map((step) => (
        <Fragment key={step}>
          <TextBody tone="secondary" strong>
            {t(
              `bottom_sheet_demo.step.${step.toLowerCase() as Lowercase<TransferStep>}`,
            )}
          </TextBody>
          {PICKABLE_SCENARIO_IDS.filter(
            (scenarioId) => TRANSFER_SCENARIOS[scenarioId].step === step,
          ).map((scenarioId) => (
            <ItemScenarioDemo
              key={scenarioId}
              label={scenarioTitle(scenarioId)}
              checked={activeScenarioId === scenarioId}
              onPress={() => {
                pickTransferScenario(scenarioId);
                onClose();
              }}
            />
          ))}
        </Fragment>
      ))}
    </BottomSheetFrame>
  );
}

interface ItemScenarioDemoProps {
  label: string;
  checked: boolean;
  onPress: () => void;
}
function ItemScenarioDemo({ label, checked, onPress }: ItemScenarioDemoProps) {
  const { i18n } = useTranslation();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityLanguage={i18n.language}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={itemScenarioDemoStyles.item}
    >
      <View
        style={[
          itemScenarioDemoStyles.mark,
          checked && itemScenarioDemoStyles.markChecked,
        ]}
      />
      <Text style={itemScenarioDemoStyles.label}>{label}</Text>
    </Pressable>
  );
}

const itemScenarioDemoStyles = StyleSheet.create({
  item: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  markChecked: { borderWidth: 6, borderColor: colors.accent },
  label: { ...typography.body, flex: 1, color: colors.textPrimary },
});

// Picking an unlisted scenario does nothing: those are the bank acting normally, or happen on the phone.
const PICKABLE_SCENARIO_IDS = (
  Object.keys(TRANSFER_SCENARIOS) as TransferScenarioId[]
).filter((scenarioId) => {
  const scenario: TransferScenario = TRANSFER_SCENARIOS[scenarioId];
  return scenario.handlers !== undefined || scenario.conditions !== undefined;
});
const PHONE_SIDE_SCENARIO_IDS = (
  Object.keys(TRANSFER_SCENARIOS) as TransferScenarioId[]
).filter((scenarioId) => {
  const scenario: TransferScenario = TRANSFER_SCENARIOS[scenarioId];
  return scenario.phoneSide === true;
});
