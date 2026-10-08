import { fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import { findAccessibleGroupAround } from "@/test/accessible-group";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

it("tells a screen reader that Home's words are in Bahasa Malaysia once it is picked", async () => {
  mswServer.use(
    http.get(
      "*/accounts/primary",
      () =>
        HttpResponse.json(
          { error: { code: "NEW_BANK_CODE", message: "Unknown to this app." } },
          { status: 400 },
        ),
      { once: true },
    ),
  );
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  const tryAgain = await screen.findByRole("button", { name: "Cuba lagi" });
  expect(tryAgain).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.press(tryAgain);

  expect(
    await screen.findByText("Anda masih boleh menghantar RM 5,000.00 hari ini"),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
  expect(findAccessibleGroupAround(screen.getByText("Baki"))).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
  expect(screen.getByRole("button", { name: "Pindahan" })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "BM, tukar bahasa" }),
  );
  expect(screen.getByRole("header", { name: "Bahasa" })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
  expect(screen.getByRole("button", { name: "Tutup menu bahasa" })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
});

it("tells a screen reader that Home is loading in Bahasa Malaysia when the app opens with it picked", async () => {
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute("/");

  expect(screen.getByLabelText("Memuatkan")).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
});
