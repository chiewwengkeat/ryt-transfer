import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { deleteApprovalKeys } from "@/domains/approval/hooks/approval-keys";
import { addUnauthorizedListener } from "@/shared/http/transport";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import { demoLayer } from "@/shell/app-launch";
import { queryClient } from "@/shell/query-client";
// At module scope, not in a provider: the root boundary renders in this component's place and needs the strings.
import "@/shell/translations";

import ViewSessionEnded from "./components/ViewSessionEnded/ViewSessionEnded";

export default function ViewRoot() {
  const [sessionEnded, setSessionEnded] = useState(false);
  const [demoSheetOpen, setDemoSheetOpen] = useState(false);
  useEffect(
    () =>
      addUnauthorizedListener(() => {
        setSessionEnded(true);
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
        </ViewBottomSheetHost>
      </View>
      {sessionEnded && (
        <View aria-hidden={demoSheetOpen} style={styles.layer}>
          <ViewSessionEnded
            // Stands in for the host app's sign-in: the session is the host's, so a standalone build only resumes.
            onSignIn={() => {
              setSessionEnded(false);
              // An open review keeps the recipient reference it showed; asking again would mint another.
              void queryClient.invalidateQueries({
                predicate: ({ queryKey }) => queryKey[0] !== "recipient-lookup",
              });
            }}
          />
        </View>
      )}
      {/* Above the session-ended view, so a reviewer who picked an ended session can still return to normal. */}
      {demoLayer !== null && (
        <demoLayer.OverlayDemo
          onResetDemo={async () => {
            // The reset bank no longer knows this phone's keys, and pairing skips a phone that still holds keys.
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
