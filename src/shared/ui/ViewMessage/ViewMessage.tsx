import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

interface Props {
  title: string;
  message: string;
  actions: ReactNode;
  fullScreen?: boolean;
}
export default function ViewMessage({
  title,
  message,
  actions,
  fullScreen = false,
}: Props) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={[styles.container, fullScreen && { paddingTop: top }]}>
      <ViewScreenFrame footer={actions}>
        <TextHeading>{title}</TextHeading>
        <TextBody>{message}</TextBody>
      </ViewScreenFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
