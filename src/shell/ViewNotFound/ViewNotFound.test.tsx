import { fireEvent, screen } from "@testing-library/react-native";

import { renderRoute } from "@/test/render-route";

it("says a page that does not exist is not found, and goes Home from there", async () => {
  const view = await renderRoute("/no-such-page");

  expect(
    await screen.findByText("This page does not exist in the app."),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Go to Home" }));

  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/");
});
