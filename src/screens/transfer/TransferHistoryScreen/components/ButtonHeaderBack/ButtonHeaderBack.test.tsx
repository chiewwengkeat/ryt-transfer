import { fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { renderRoute } from "@/test/render-route";
import "@/test/transfer-history-pages";

it("goes back to Home from History's header", async () => {
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer history" }),
  );

  await fireEvent.press(await screen.findByRole("button", { name: "Back" }));

  expect(view.getPathname()).toBe("/");
  expect(router.canGoBack()).toBe(false);
});

it("goes to Home from History opened by a link, with nothing beneath it", async () => {
  const view = await renderRoute("/transfer-history");

  await fireEvent.press(await screen.findByRole("button", { name: "Back" }));

  expect(view.getPathname()).toBe("/");
  expect(router.canGoBack()).toBe(false);
});
