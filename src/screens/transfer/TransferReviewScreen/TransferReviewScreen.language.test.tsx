import { fireEvent, screen } from "@testing-library/react-native";

import { findAccessibleGroupAround } from "@/test/accessible-group";
import { renderRoute } from "@/test/render-route";

it("tells a screen reader that a transfer's fields and review rows are in Bahasa Malaysia once it is picked", async () => {
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Pindahan", disabled: false }),
  );
  const mobileField = await screen.findByLabelText(
    "Nombor telefon bimbit DuitNow",
  );
  expect(mobileField).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.changeText(mobileField, "012-345 6789");
  await fireEvent.press(screen.getByRole("button", { name: "Teruskan" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Jumlah (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Semak" }));
  await screen.findByRole("button", { name: "Pindahkan" });

  expect(findAccessibleGroupAround(screen.getByText("Jumlah"))).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
});
