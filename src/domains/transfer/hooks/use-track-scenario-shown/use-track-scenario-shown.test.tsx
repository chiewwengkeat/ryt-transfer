import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { pressHardwareBack } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Pressable, Text } from "react-native";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { useTrackScenarioShown } from "./use-track-scenario-shown";

it("reports what a covered screen came to show once it is back on top, and not again on later returns", async () => {
  await renderRoute("/", {
    appDir: "src/app",
    overrides: {
      index: HomeOpeningDetails,
      details: () => <Text>Details</Text>,
    },
  });
  await fireEvent.press(screen.getByRole("button", { name: "Open details" }));

  await act(() => {
    homeScenarioStore.setState({
      scenario: TransferScenarioId.RecipientUnexpected,
    });
  });
  // A covered screen renders late: read the reports before it shows the scenario and this passes either way.
  await screen.findByText("transfer.recipient_unexpected", {
    includeHiddenElements: true,
  });
  const reportedWhileCovered = [...reportedScenarios()];
  await pressHardwareBack();
  await fireEvent.press(screen.getByRole("button", { name: "Open details" }));
  await pressHardwareBack();

  expect(reportedWhileCovered).not.toContain("transfer.recipient_unexpected");
  expect(
    reportedScenarios().filter(
      (scenario) => scenario === "transfer.recipient_unexpected",
    ),
  ).toHaveLength(1);
});

const homeScenarioStore = createStore<{ scenario?: TransferScenarioId }>(
  () => ({}),
);

function HomeOpeningDetails() {
  const scenario = useStore(homeScenarioStore, (home) => home.scenario);
  useTrackScenarioShown(scenario);
  return (
    <>
      <Text>{scenario ?? "No scenario"}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.push("./details");
        }}
      >
        <Text>Open details</Text>
      </Pressable>
    </>
  );
}
