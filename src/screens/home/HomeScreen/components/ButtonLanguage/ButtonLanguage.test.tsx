import { fireEvent, screen } from "@testing-library/react-native";
import * as Localization from "expo-localization";
import { changeLanguage } from "i18next";
import { http, HttpResponse } from "msw";

import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import { mswServer } from "@/test/msw-server";
import { relaunchApp } from "@/test/relaunch-app";
import { renderRoute } from "@/test/render-route";

function setPhoneLanguage(languageCode: string) {
  jest
    .spyOn(Localization, "getLocales")
    .mockReturnValue([{ languageCode } as Localization.Locale]);
}

// ⛔ Assert on the group, never the text: each text carries the language itself, so it passes either way.
function findAccessibleGroupAround(text: ReturnType<typeof screen.getByText>) {
  let element = text.parent;
  while (element !== null && element.props.accessible !== true)
    element = element.parent;
  return element;
}

// The app's language lives in i18next, which outlasts a test.
afterEach(async () => {
  jest.restoreAllMocks();
  await changeLanguage(AppLanguage.English);
});

it("shows Home in Bahasa Malaysia once it is picked, and still after a relaunch", async () => {
  setPhoneLanguage("en");
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  expect(screen.getByRole("radio", { name: "Phone's language" })).toBeChecked();
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));

  expect(
    await screen.findByRole("button", { name: "Pindahan" }),
  ).toBeOnTheScreen();
  await relaunchApp(view);
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, tukar bahasa" }),
  );
  expect(screen.getByRole("radio", { name: "Bahasa Malaysia" })).toBeChecked();
  expect(
    screen.getByRole("radio", { name: "Bahasa telefon" }),
  ).not.toBeChecked();
});

it("follows the phone's language once Phone's language is picked, and still after a relaunch", async () => {
  setPhoneLanguage("zh");
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, tukar bahasa" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa telefon" }));

  expect(await screen.findByRole("button", { name: "转账" })).toBeOnTheScreen();
  await relaunchApp(view);
  expect(await screen.findByRole("button", { name: "转账" })).toBeOnTheScreen();
});

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

it("tells a screen reader that a transfer's fields and review rows are in Bahasa Malaysia once it is picked", async () => {
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Pindahan" }),
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

it("forgets the pick when Phone's language is picked while the phone shows the same language", async () => {
  setPhoneLanguage("ms");
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, change language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, tukar bahasa" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa telefon" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, tukar bahasa" }),
  );
  expect(screen.getByRole("radio", { name: "Bahasa telefon" })).toBeChecked();
  await fireEvent.press(
    screen.getByRole("button", { name: "Tutup menu bahasa" }),
  );

  setPhoneLanguage("zh");
  await relaunchApp(view);

  expect(await screen.findByRole("button", { name: "转账" })).toBeOnTheScreen();
});
