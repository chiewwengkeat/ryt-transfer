import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { deleteApprovalKeys } from "@/domains/approval/hooks/approval-keys";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import { addUnauthorizedListener } from "@/shared/http/transport";
import { deleteAllSecureRecords } from "@/shared/platform/secure-storage";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import { demoLayer } from "@/shell/app-launch";
import { queryClient } from "@/shell/query-client";
import { endSession } from "@/shell/session/end-session";
// At module scope, not in a provider: the root boundary renders in this component's place and needs the strings.
import "@/shell/translations";

import BannerOffline from "./components/BannerOffline/BannerOffline";
import ViewPinSheetHost from "./components/ViewPinSheetHost/ViewPinSheetHost";
import ViewSessionEnded from "./components/ViewSessionEnded/ViewSessionEnded";
import { usePendingTransfersAtLaunch } from "./hooks/use-pending-transfers-at-launch";

export default function ViewRoot() {
  usePendingTransfersAtLaunch();
  const [sessionEnded, setSessionEnded] = useState(false);
  const [demoSheetOpen, setDemoSheetOpen] = useState(false);
  useEffect(
    () =>
      addUnauthorizedListener(() => {
        setSessionEnded(true);
      }),
    [],
  );
  useEffect(
    () =>
      demoLayer?.subscribeToBiometricsOff((biometricsOff) => {
        approvalSettingsStore.setState({ biometricApprovalOn: !biometricsOff });
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <View aria-hidden={sessionEnded || demoSheetOpen} style={styles.app}>
        <ViewBottomSheetHost>
          <Stack>
            <Stack.Screen name="transfer" options={{ headerShown: false }} />
          </Stack>
          <BannerOffline />
          <ViewPinSheetHost />
        </ViewBottomSheetHost>
      </View>
      {sessionEnded && (
        <View aria-hidden={demoSheetOpen} style={styles.layer}>
          <ViewSessionEnded
            // Stands in for the host app's sign-in: the session is the host's, so a standalone build only resumes.
            onSignIn={() => {
              setSessionEnded(false);
              // A name check that answered keeps the reference it showed: asking again would mint another.
              void queryClient.invalidateQueries({
                predicate: ({ queryKey, state }) =>
                  queryKey[0] !== "recipient-lookup" ||
                  state.data === undefined,
              });
            }}
          />
        </View>
      )}
      {/* Above the session-ended view, so a reviewer who picked an ended session can still return to normal. */}
      {demoLayer !== null && (
        <demoLayer.OverlayDemo
          onResetDemo={async () => {
            // First: endSession's clear() leaves a mounted screen showing its last read, so it reads the reset bank now.
            await queryClient.resetQueries();
            await endSession();
            // The reset bank knows none of this phone's keys, and pairing skips a phone whose key ids are on file.
            await deleteAllSecureRecords();
            await deleteApprovalKeys();
            await demoLayer?.pairPhoneAtFirstLaunch();
          }}
          onSheetOpenChange={setDemoSheetOpen}
        />
      )}
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  layer: { ...StyleSheet.absoluteFill, pointerEvents: "box-none" },
});
