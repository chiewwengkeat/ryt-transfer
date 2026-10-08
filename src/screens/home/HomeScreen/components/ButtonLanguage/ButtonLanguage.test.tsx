import { fireEvent, screen } from "@testing-library/react-native";
import * as Localization from "expo-localization";
import { changeLanguage } from "i18next";

import { AppLanguage } from "@/shared/i18n/i18n";
import { relaunchApp } from "@/test/relaunch-app";
import { renderRoute } from "@/test/render-route";

function setPhoneLanguage(languageCode: string) {
  jest
    .spyOn(Localization, "getLocales")
    .mockReturnValue([{ languageCode } as Localization.Locale]);
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
    await screen.findByRole("button", { name: "EN, Language" }),
  );
  expect(screen.getByRole("radio", { name: "Phone's language" })).toBeChecked();
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));

  expect(
    await screen.findByRole("button", { name: "Pindahan" }),
  ).toBeOnTheScreen();
  await relaunchApp(view);
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, Bahasa" }),
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
    await screen.findByRole("button", { name: "EN, Language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, Bahasa" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa telefon" }));

  expect(await screen.findByRole("button", { name: "转账" })).toBeOnTheScreen();
  await relaunchApp(view);
  expect(await screen.findByRole("button", { name: "转账" })).toBeOnTheScreen();
});

it("forgets the pick when Phone's language is picked while the phone shows the same language", async () => {
  setPhoneLanguage("ms");
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "EN, Language" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa Malaysia" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, Bahasa" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Bahasa telefon" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "BM, Bahasa" }),
  );
  expect(screen.getByRole("radio", { name: "Bahasa telefon" })).toBeChecked();
  await fireEvent.press(
    screen.getByRole("button", { name: "Tutup menu bahasa" }),
  );

  setPhoneLanguage("zh");
  await relaunchApp(view);

  expect(await screen.findByRole("button", { name: "转账" })).toBeOnTheScreen();
});
