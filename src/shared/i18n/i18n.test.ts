import * as Localization from "expo-localization";
import { t } from "i18next";

import { kvStorage } from "@/shared/platform/kv-storage";

import { AppLanguage, initTranslations, pickAppLanguage } from "./i18n";

const WELCOME_IN_EVERY_LANGUAGE = {
  "en-MY": { common: [{ welcome: "Welcome" }] },
  "ms-MY": { common: [{ welcome: "Selamat datang" }] },
  "zh-MY": { common: [{ welcome: "欢迎" }] },
};

function launchOnPhoneSetTo(
  languageCode: string,
  bundles: Parameters<typeof initTranslations>[0] = WELCOME_IN_EVERY_LANGUAGE,
) {
  jest
    .spyOn(Localization, "getLocales")
    .mockReturnValue([{ languageCode } as Localization.Locale]);
  initTranslations(bundles);
}

afterEach(() => {
  jest.restoreAllMocks();
});

it.each([
  ["en", "Welcome"],
  ["ms", "Selamat datang"],
  ["zh", "欢迎"],
  ["ta", "Welcome"],
])("greets a phone set to %s with %s", (languageCode, greeting) => {
  launchOnPhoneSetTo(languageCode);

  expect(t("welcome", { defaultValue: "missing" })).toBe(greeting);
});

it("shows English in a language with no bundle yet", () => {
  launchOnPhoneSetTo("ms", { "en-MY": WELCOME_IN_EVERY_LANGUAGE["en-MY"] });

  expect(t("welcome", { defaultValue: "missing" })).toBe("Welcome");
});

it("follows the phone's language at every launch until one is picked", () => {
  launchOnPhoneSetTo("ms");
  launchOnPhoneSetTo("zh");

  expect(t("welcome", { defaultValue: "missing" })).toBe("欢迎");
});

it("keeps a picked language over the phone's at the next launch", () => {
  launchOnPhoneSetTo("ms");
  pickAppLanguage(AppLanguage.Chinese);
  launchOnPhoneSetTo("ms");

  expect(t("welcome", { defaultValue: "missing" })).toBe("欢迎");
});

it("follows the phone when the stored language is not one the app has", () => {
  kvStorage.setItemSync("app-language", AppLanguage.Chinese);
  launchOnPhoneSetTo("ms");
  const greetingInStoredLanguage = t("welcome", { defaultValue: "missing" });
  kvStorage.setItemSync("app-language", "fr-FR");
  launchOnPhoneSetTo("ms");

  expect(greetingInStoredLanguage).toBe("欢迎");
  expect(t("welcome", { defaultValue: "missing" })).toBe("Selamat datang");
});
