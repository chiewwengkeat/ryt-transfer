import { StyleSheet, View } from "react-native";

import { TransferDirection } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { colors } from "@/shared/theme/theme";

interface Props {
  direction: TransferDirection;
}
export default function IconTransferDirection({ direction }: Props) {
  return (
    <View aria-hidden style={styles.circle}>
      <View
        style={[
          styles.arrow,
          direction === TransferDirection.In ? styles.received : styles.sent,
        ]}
      >
        <View style={styles.shaft} />
        <View style={styles.head} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  arrow: { width: 14, height: 14, alignItems: "center" },
  sent: { transform: [{ rotate: "45deg" }] },
  received: { transform: [{ rotate: "225deg" }] },
  shaft: {
    position: "absolute",
    top: 1,
    bottom: 0,
    width: 2,
    backgroundColor: colors.textPrimary,
  },
  head: {
    position: "absolute",
    top: 1,
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: colors.textPrimary,
    transform: [{ rotate: "45deg" }],
  },
});
