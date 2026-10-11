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
import { useInitialValue } from "@/shared/hooks/use-initial-value/use-initial-value";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { Fragment } from "react";
import { useStore } from "zustand";
import ItemScenarioDemo from "./components/ItemScenarioDemo/ItemScenarioDemo";

interface Props {
  onResetDemo: () => Promise<void>;
  onClose: () => void;
}
export default function BottomSheetDemo({ onResetDemo, onClose }: Props) {
  const { t, titleOfScenario } = useDemoTranslation();
  const isPinLocked = useInitialValue(isDemoPinLocked);

  const activeScenarioId = useStore(switcherStore, (pick) => pick.scenarioId);

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
      {isPinLocked && (
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
      {PHONE_SIDE_SCENARIO_IDS.map((scenarioId) => (
        <ItemScenarioDemo
          key={scenarioId}
          label={titleOfScenario(scenarioId)}
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
              label={titleOfScenario(scenarioId)}
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
