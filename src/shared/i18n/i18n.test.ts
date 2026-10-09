import * as Localization from "expo-localization";
import { t } from "i18next";

import { kvStorage } from "@/shared/platform/kv-storage/kv-storage";

import {
  AppLanguage,
  followPhoneLanguage,
  initTranslations,
  pickAppLanguage,
  readPickedAppLanguage,
} from "./i18n";

const WELCOME_IN_EVERY_LANGUAGE = {
  "en-MY": { shared: [{ welcome: "Welcome" }] },
  "ms-MY": { shared: [{ welcome: "Selamat datang" }] },
  "zh-MY": { shared: [{ welcome: "欢迎" }] },
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

  expect(t("shared:welcome", { defaultValue: "missing" })).toBe(greeting);
});

it("shows English in a language with no bundle yet", () => {
  launchOnPhoneSetTo("ms", { "en-MY": WELCOME_IN_EVERY_LANGUAGE["en-MY"] });

  expect(t("shared:welcome", { defaultValue: "missing" })).toBe("Welcome");
});

it("follows the phone's language at every launch until one is picked", () => {
  launchOnPhoneSetTo("ms");
  launchOnPhoneSetTo("zh");

  expect(t("shared:welcome", { defaultValue: "missing" })).toBe("欢迎");
});

it("keeps a picked language over the phone's at the next launch", () => {
  launchOnPhoneSetTo("ms");
  pickAppLanguage(AppLanguage.Chinese);
  launchOnPhoneSetTo("ms");

  expect(t("shared:welcome", { defaultValue: "missing" })).toBe("欢迎");
});

it("reads back the picked language, and only one the app has", () => {
  launchOnPhoneSetTo("ms");
  const pickedBeforeAnyPick = readPickedAppLanguage();
  pickAppLanguage(AppLanguage.Chinese);
  const pickedAfterPick = readPickedAppLanguage();
  kvStorage.setItemSync("app-language", "fr-FR");

  expect(pickedBeforeAnyPick).toBeUndefined();
  expect(pickedAfterPick).toBe(AppLanguage.Chinese);
  expect(readPickedAppLanguage()).toBeUndefined();
});

it("forgets the pick once the phone's language is followed again, at once and at the next launch", () => {
  launchOnPhoneSetTo("ms");
  pickAppLanguage(AppLanguage.Chinese);
  followPhoneLanguage();
  const greetingOnceFollowed = t("shared:welcome", { defaultValue: "missing" });
  launchOnPhoneSetTo("ms");

  expect(greetingOnceFollowed).toBe("Selamat datang");
  expect(readPickedAppLanguage()).toBeUndefined();
  expect(t("shared:welcome", { defaultValue: "missing" })).toBe(
    "Selamat datang",
  );
});

it("follows the phone when the stored language is not one the app has", () => {
  kvStorage.setItemSync("app-language", AppLanguage.Chinese);
  launchOnPhoneSetTo("ms");
  const greetingInStoredLanguage = t("shared:welcome", {
    defaultValue: "missing",
  });
  kvStorage.setItemSync("app-language", "fr-FR");
  launchOnPhoneSetTo("ms");

  expect(greetingInStoredLanguage).toBe("欢迎");
  expect(t("shared:welcome", { defaultValue: "missing" })).toBe(
    "Selamat datang",
  );
});
