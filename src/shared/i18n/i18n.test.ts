import * as Localization from "expo-localization";
import i18next, { t } from "i18next";

import { AppLanguage, initTranslations, pickAppLanguage } from "./i18n";

function launchOnPhoneSetTo(languageCode: string) {
  jest
    .spyOn(Localization, "getLocales")
    .mockReturnValue([{ languageCode } as Localization.Locale]);
  initTranslations({ "en-MY": { common: [{ greeting: "Hello" }] } });
}

afterEach(() => {
  jest.restoreAllMocks();
});

it.each([
  ["en", "en-MY"],
  ["ms", "ms-MY"],
  ["zh", "zh-MY"],
  ["ta", "en-MY"],
])("launches a phone set to %s in %s", (languageCode, appLanguage) => {
  launchOnPhoneSetTo(languageCode);

  expect(i18next.language).toBe(appLanguage);
});

it("shows English in a language with no bundle yet", () => {
  launchOnPhoneSetTo("ms");

  expect(t("greeting", { defaultValue: "missing" })).toBe("Hello");
});

it("follows the phone's language at every launch until one is picked", () => {
  launchOnPhoneSetTo("ms");
  launchOnPhoneSetTo("zh");

  expect(i18next.language).toBe("zh-MY");
});

it("keeps a picked language over the phone's at the next launch", () => {
  launchOnPhoneSetTo("ms");
  pickAppLanguage(AppLanguage.Chinese);
  launchOnPhoneSetTo("ms");

  expect(i18next.language).toBe("zh-MY");
});
