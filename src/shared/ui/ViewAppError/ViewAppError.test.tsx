import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { observedRecords } from "@/test/doubles/recording-sink";
import { renderRoute } from "@/test/render/render-route";

let screenCrashes = true;
function ScreenWithNoBoundary() {
  if (screenCrashes) throw new Error("render failed");
  return <Text>Home</Text>;
}

it("replaces the app when a screen with no boundary of its own crashes, and Try again remounts it", async () => {
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: ScreenWithNoBoundary },
  });

  expect(screen.getByText("The app stopped working.")).toBeOnTheScreen();
  expect(observedRecords).toContainEqual({
    type: "error",
    name: "Error",
    properties: { boundary: "root" },
  });

  screenCrashes = false;
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(screen.getByText("Home")).toBeOnTheScreen();
});
