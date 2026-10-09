import { fireEvent, screen } from "@testing-library/react-native";

import { renderRoute } from "@/test/render/render-route";

it("says a page that does not exist is not found, and goes Home from there", async () => {
  // Mounted past the link guard, which sends an unknown path Home: only the app's own navigation can reach this.
  const view = await renderRoute("/no-such-page", {
    appDir: "src/app",
    overrides: {},
  });

  expect(
    await screen.findByText("This page does not exist in the app."),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Go to Home" }));

  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/");
});
