import { ApprovalDemoPinContext } from "@/domains/approval/lib/approval-demo-pin/approval-demo-pin";
import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { deleteApprovalKeys } from "@/domains/approval/lib/approval-keys/approval-keys";
import { rootedPhoneDemoPickStore } from "@/domains/approval/lib/device-integrity-verdict/device-integrity-verdict";
import { readAgainEveryReadButAnsweredNameChecks } from "@/domains/transfer/lib/read-again-every-read-but-answered-name-checks/read-again-every-read-but-answered-name-checks";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { demoLayer, stackScreenOptions } from "@/root/app-launch/app-launch";
import { queryClient } from "@/root/query-client/query-client";
import {
  holdTransferScenarioReports,
  releaseTransferScenarioReports,
  transferFlowStore,
} from "@/screens/transfer/flow-store/flow-store";
import { ScreensCoveredContext } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { addUnauthorizedListener } from "@/shared/http/transport/transport";
import { deleteAllSecureRecords } from "@/shared/platform/secure-storage/secure-storage";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import ViewSessionEnded from "./components/ViewSessionEnded/ViewSessionEnded";
import { usePendingTransfersAtLaunch } from "./hooks/use-pending-transfers-at-launch/use-pending-transfers-at-launch";
import { useScreenCaptureBlock } from "./hooks/use-screen-capture-block/use-screen-capture-block";
import { forgetSignedInCustomer } from "./lib/forget-signed-in-customer/forget-signed-in-customer";
// At module scope, not in a provider: the root boundary renders in this component's place and needs the strings.
import "@/root/translations/translations";

export default function ViewRoot() {
  const [hasSessionEnded, setHasSessionEnded] = useState(false);
  const [isAppSheetOpen, setIsAppSheetOpen] = useState(false);
  const [navigatorMounts, setNavigatorMounts] = useState(0);

  const appWithSessionEndedView = (
    <>
      <View
        aria-hidden={hasSessionEnded}
        // Never flattened: aria-hidden alone would add and remove this view as a session ends and begins, re-parenting the screens beneath.
        collapsable={false}
        style={styles.app}
      >
        <ScreensCoveredContext value={hasSessionEnded}>
          <ApprovalDemoPinContext value={demoLayer?.demoPin}>
            <ViewBottomSheetHost
              // Production has no Demo header to hide, so its root need not re-render as sheets open.
              onSheetOpenChange={
                demoLayer === null ? undefined : setIsAppSheetOpen
              }
            >
              <Stack key={navigatorMounts} screenOptions={stackScreenOptions}>
                <Stack.Screen
                  name="transfer"
                  options={{ headerShown: false, headerLeft: () => null }}
                />
              </Stack>
            </ViewBottomSheetHost>
          </ApprovalDemoPinContext>
        </ScreensCoveredContext>
      </View>
      {hasSessionEnded && (
        <View style={styles.layer}>
          <ViewSessionEnded
            // Stands in for the host app's sign-in: the session is the host's, so a standalone build only resumes.
            onSignIn={() => {
              setHasSessionEnded(false);
              releaseTransferScenarioReports(transferFlowStore.getState());
              readAgainEveryReadButAnsweredNameChecks(queryClient, {
                isRefusalAnAnswer: true,
              });
            }}
          />
        </View>
      )}
    </>
  );

  usePendingTransfersAtLaunch();
  useScreenCaptureBlock(TransferScenarioId.ScreenCaptureBlocked);
  useEffect(
    () =>
      demoLayer?.subscribeToPhoneSidePick(
        TransferScenarioId.BiometricsUnavailable,
        (isPicked) => {
          approvalSettingsStore.setState({ biometricApprovalOn: !isPicked });
        },
      ),
    [],
  );
  useEffect(
    () =>
      demoLayer?.subscribeToPhoneSidePick(
        TransferScenarioId.RootedPhone,
        (isPicked) => {
          rootedPhoneDemoPickStore.setState({ rootedPhonePicked: isPicked });
        },
      ),
    [],
  );
  useEffect(() => {
    // Android otherwise keeps the status bar's icons white, unseen on the app's white headers. Called,
    // not rendered: a <StatusBar> here stalled route tests under renderRoute's fake timers.
    StatusBar.setBarStyle("dark-content");
  }, []);
  useEffect(() => {
    const removeUnauthorizedListener = addUnauthorizedListener(() => {
      setHasSessionEnded(true);
      // Here, not on the render: an answer settled in this same moment would report beneath the view.
      holdTransferScenarioReports();
    });
    return () => {
      removeUnauthorizedListener();
      releaseTransferScenarioReports();
    };
  }, []);
  useEffect(
    () =>
      demoLayer?.subscribeToScenarioChange(() => {
        readAgainEveryReadButAnsweredNameChecks(queryClient, {
          isRefusalAnAnswer: false,
        });
      }),
    [],
  );

  async function handleResetDemo() {
    // First: forgetSignedInCustomer's clear() leaves a mounted screen showing its last read, so it reads the reset bank now.
    await queryClient.resetQueries();
    await forgetSignedInCustomer();
    // The reset bank knows none of this phone's keys, and pairing skips a phone whose key ids are on file.
    await deleteAllSecureRecords();
    await deleteApprovalKeys();
    await demoLayer?.pairPhoneAtFirstLaunch();
    // Remounts every screen: forgetSignedInCustomer's clear() leaves their reads on removed queries, which no later answer reaches.
    setNavigatorMounts((mounts) => mounts + 1);
  }

  return (
    <QueryClientProvider client={queryClient}>
      {demoLayer === null ? (
        appWithSessionEndedView
      ) : (
        // Outside the session-ended view, so a reviewer who picked an ended session can still return to normal.
        <demoLayer.ViewDemo
          appSheetOpen={isAppSheetOpen && !hasSessionEnded}
          onResetDemo={handleResetDemo}
        >
          {appWithSessionEndedView}
        </demoLayer.ViewDemo>
      )}
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  layer: { ...StyleSheet.absoluteFill, pointerEvents: "box-none" },
});
