import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { addUnauthorizedListener } from "@/shared/http/transport";
import "@/shell/app-launch";
import { queryClient } from "@/shell/query-client";
// At module scope, not in a provider: the root boundary renders in this component's place and needs the strings.
import "@/shell/translations";

import ViewSessionEnded from "./components/ViewSessionEnded/ViewSessionEnded";

export default function ViewRoot() {
  const [sessionEnded, setSessionEnded] = useState(false);
  useEffect(
    () =>
      addUnauthorizedListener(() => {
        setSessionEnded(true);
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <View aria-hidden={sessionEnded} style={styles.app}>
        <Stack />
      </View>
      {sessionEnded && (
        <ViewSessionEnded
          // Stands in for the host app's sign-in: the session is the host's, so a standalone build only resumes.
          onSignIn={() => {
            setSessionEnded(false);
            void queryClient.invalidateQueries();
          }}
        />
      )}
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});
