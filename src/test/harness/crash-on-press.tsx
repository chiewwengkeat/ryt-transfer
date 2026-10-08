import { useState } from "react";
import { Pressable, Text } from "react-native";

export function ButtonCrashScreen() {
  const [crashed, setCrashed] = useState(false);
  // Only on a press: a crash in the first render replaces the app before its guard has run.
  if (crashed) throw new Error("render failed");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setCrashed(true);
      }}
    >
      <Text>Crash the screen</Text>
    </Pressable>
  );
}
