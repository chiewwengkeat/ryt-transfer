import { fireEvent, screen } from "@testing-library/react-native";

import { renderRoute } from "@/test/render-route";

it("opens the transfer history from Home", async () => {
  const view = await renderRoute("/");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer history" }),
  );

  expect(view.getPathname()).toBe("/transfer-history");
});
