import { Fragment, useState } from "react";
import { useStore } from "zustand";

import {
  clearTransferScenario,
  isDemoPinLocked,
  pickTransferScenario,
  resetDemoBank,
  unlockDemoPin,
} from "@/mocks/demo-bank";
import {
  TRANSFER_SCENARIOS,
  TransferStep,
  type TransferScenario,
  type TransferScenarioId,
} from "@/mocks/scenarios/transfer-scenarios";
import { useDemoTranslation } from "@/mocks/switcher/components/OverlayDemo/hooks/use-demo-translation";
import { switcherStore } from "@/mocks/switcher/switcher-store";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import TextBody from "@/shared/ui/TextBody/TextBody";

import ItemScenarioDemo from "./components/ItemScenarioDemo/ItemScenarioDemo";

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
        checked={activeScenarioId === "transfer.biometrics_unavailable"}
        onPress={() => {
          pickTransferScenario("transfer.biometrics_unavailable");
          onClose();
        }}
      />
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
      <ButtonSecondary
        label={t("bottom_sheet_demo.reset")}
        onPress={() => {
          onClose();
          void resetDemoBank().then(onResetDemo);
        }}
      />
    </BottomSheetFrame>
  );
}

// Picking any other does nothing: those are the bank acting normally, or happen on the phone.
const PICKABLE_SCENARIO_IDS = (
  Object.keys(TRANSFER_SCENARIOS) as TransferScenarioId[]
).filter((scenarioId) => {
  const scenario: TransferScenario = TRANSFER_SCENARIOS[scenarioId];
  return scenario.handlers !== undefined || scenario.conditions !== undefined;
});
