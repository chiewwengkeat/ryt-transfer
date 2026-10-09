import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { deleteApprovalKeys } from "@/domains/approval/hooks/approval-keys";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import { rootedPhoneDemoPickStore } from "@/domains/approval/hooks/device-integrity-verdict";
import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import {
  holdTransferScenarioReports,
  releaseTransferScenarioReports,
  transferFlowStore,
} from "@/screens/transfer/flow-store/flow-store";
import { ScreensCoveredContext } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { addUnauthorizedListener } from "@/shared/http/transport/transport";
import {
  isSessionEndFailure,
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";
import { screenTransitionOptions } from "@/shared/lib/motion/motion";
import { deleteAllSecureRecords } from "@/shared/platform/secure-storage/secure-storage";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import { demoLayer } from "@/root/app-launch/app-launch";
import { queryClient } from "@/root/query-client/query-client";
import { forgetSignedInCustomer } from "./lib/forget-signed-in-customer/forget-signed-in-customer";
// At module scope, not in a provider: the root boundary renders in this component's place and needs the strings.
import "@/root/translations/translations";

import BannerOffline from "@/domains/transfer/components/BannerOffline/BannerOffline";
import ViewPinSheetHost from "@/domains/approval/components/ViewPinSheetHost/ViewPinSheetHost";
import ViewSessionEnded from "./components/ViewSessionEnded/ViewSessionEnded";
import { usePendingTransfersAtLaunch } from "./hooks/use-pending-transfers-at-launch/use-pending-transfers-at-launch";
import { useScreenCaptureBlock } from "./hooks/use-screen-capture-block/use-screen-capture-block";

export default function ViewRoot() {
  usePendingTransfersAtLaunch();
  useScreenCaptureBlock();
  const [sessionEnded, setSessionEnded] = useState(false);
  const [appSheetOpen, setAppSheetOpen] = useState(false);
  const [navigatorMounts, setNavigatorMounts] = useState(0);
  useEffect(() => {
    const removeUnauthorizedListener = addUnauthorizedListener(() => {
      setSessionEnded(true);
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
      demoLayer?.subscribeToBiometricsOff((biometricsOff) => {
        approvalSettingsStore.setState({ biometricApprovalOn: !biometricsOff });
      }),
    [],
  );
  useEffect(
    () =>
      demoLayer?.subscribeToScenarioChange(() => {
        readAgainEveryReadButAnsweredNameChecks({ refusalsAreAnswers: false });
      }),
    [],
  );
  useEffect(
    () =>
      demoLayer?.subscribeToRootedPhone((rootedPhonePicked) => {
        rootedPhoneDemoPickStore.setState({ rootedPhonePicked });
      }),
    [],
  );

  const appWithSessionEndedView = (
    <>
      <View aria-hidden={sessionEnded} style={styles.app}>
        <ScreensCoveredContext value={sessionEnded}>
          <ViewBottomSheetHost
            // Production has no Demo header to hide, so its root need not re-render as sheets open.
            onSheetOpenChange={demoLayer === null ? undefined : setAppSheetOpen}
          >
            <Stack
              key={navigatorMounts}
              // Android's header pads for the status bar itself, a place the Demo header has already taken.
              screenOptions={
                demoLayer === null
                  ? screenTransitionOptions
                  : () => ({
                      ...screenTransitionOptions(),
                      unstable_nativeProps: {
                        headerConfig: { disableTopInsetApplication: true },
                      },
                    })
              }
            >
              <Stack.Screen name="transfer" options={{ headerShown: false }} />
            </Stack>
            <BannerOffline />
            <ViewPinSheetHost />
          </ViewBottomSheetHost>
        </ScreensCoveredContext>
      </View>
      {sessionEnded && (
        <View style={styles.layer}>
          <ViewSessionEnded
            // Stands in for the host app's sign-in: the session is the host's, so a standalone build only resumes.
            onSignIn={() => {
              setSessionEnded(false);
              releaseTransferScenarioReports(transferFlowStore.getState());
              readAgainEveryReadButAnsweredNameChecks({
                refusalsAreAnswers: true,
              });
            }}
          />
        </View>
      )}
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {demoLayer === null ? (
        appWithSessionEndedView
      ) : (
        // Outside the session-ended view, so a reviewer who picked an ended session can still return to normal.
        <demoLayer.ViewDemo
          appSheetOpen={appSheetOpen && !sessionEnded}
          onResetDemo={async () => {
            // First: forgetSignedInCustomer's clear() leaves a mounted screen showing its last read, so it reads the reset bank now.
            await queryClient.resetQueries();
            await forgetSignedInCustomer();
            // The reset bank knows none of this phone's keys, and pairing skips a phone whose key ids are on file.
            await deleteAllSecureRecords();
            await deleteApprovalKeys();
            await demoLayer?.pairPhoneAtFirstLaunch();
            // Remounts every screen: forgetSignedInCustomer's clear() leaves their reads on removed queries, which no later answer reaches.
            setNavigatorMounts((mounts) => mounts + 1);
          }}
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

// A found recipient stays: asking again mints another reference. After sign-in a refusal stays too, as asking again meets
// the check limit; a Demo pick asks it again, since the picked scenario may answer it otherwise.
function readAgainEveryReadButAnsweredNameChecks({
  refusalsAreAnswers,
}: {
  refusalsAreAnswers: boolean;
}) {
  void queryClient.invalidateQueries({
    predicate: ({ queryKey, state: { status, error } }) =>
      queryKey[0] !== transferKeys.lookupAll[0] ||
      status === "pending" ||
      (status === "error" &&
        (!refusalsAreAnswers ||
          isSessionEndFailure(error) ||
          (error instanceof TransportError &&
            ([
              TransportErrorKind.Network,
              TransportErrorKind.Timeout,
              TransportErrorKind.Aborted,
            ].includes(error.kind) ||
              // A server error the bank put no code on is no answer from it.
              (error.kind === TransportErrorKind.Http &&
                (error.status ?? 0) >= 500 &&
                error.code === undefined))))),
  });
}
