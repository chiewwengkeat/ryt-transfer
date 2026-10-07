import { StyleSheet, Text, View } from "react-native";

export default function IndexPlaceholder() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header">Ryt Transfer</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
