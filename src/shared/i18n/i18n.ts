import { getLocales } from "expo-localization";
import {
  changeLanguage,
  init,
  use as addI18nextPlugin,
  type Resource,
  type ResourceLanguage,
} from "i18next";
import { initReactI18next } from "react-i18next";

import { kvStorage } from "@/shared/platform/kv-storage";

export enum AppLanguage {
  English = "en-MY",
  Malay = "ms-MY",
  Chinese = "zh-MY",
}

// Never translated: each name stays in its own script, so a person finds their language whatever the app shows.
export const APP_LANGUAGE_NAMES = {
  [AppLanguage.English]: { full: "English", short: "EN" },
  [AppLanguage.Malay]: { full: "Bahasa Malaysia", short: "BM" },
  [AppLanguage.Chinese]: { full: "中文", short: "中文" },
} satisfies Record<AppLanguage, { full: string; short: string }>;

const APP_LANGUAGE_BY_PHONE_LANGUAGE = new Map([
  ["en", AppLanguage.English],
  ["ms", AppLanguage.Malay],
  ["zh", AppLanguage.Chinese],
]);
const PICKED_LANGUAGE_KEY = "app-language";

// A screens folder and its same-name domain share a namespace, each under its own top-level keys.
export function initTranslations(
  bundles: Record<string, Record<string, Record<string, unknown>[]>>,
) {
  const resources: Resource = {};
  for (const [language, namespaces] of Object.entries(bundles)) {
    const joined: ResourceLanguage = {};
    for (const [namespace, parts] of Object.entries(namespaces))
      joined[namespace] = parts.reduce(
        (all, part) => ({ ...all, ...part }),
        {},
      );
    resources[language] = joined;
  }

  addI18nextPlugin(initReactI18next);
  void init({
    resources,
    // Only a pick is stored: until there is one, every launch follows the phone's current language.
    lng: readPickedAppLanguage() ?? findAppLanguageForPhone(),
    fallbackLng: AppLanguage.English,
    defaultNS: "common",
    // Synchronous, so the first render has its strings; under fake timers an async init never finishes.
    initAsync: false,
    interpolation: { escapeValue: false },
  });
}

export function readPickedAppLanguage() {
  const storedLanguage = kvStorage.getItemSync(PICKED_LANGUAGE_KEY);
  return Object.values(AppLanguage).find(
    (language) => language === storedLanguage,
  );
}

export function pickAppLanguage(language: AppLanguage) {
  kvStorage.setItemSync(PICKED_LANGUAGE_KEY, language);
  void changeLanguage(language);
}

export function followPhoneLanguage() {
  kvStorage.removeItemSync(PICKED_LANGUAGE_KEY);
  void changeLanguage(findAppLanguageForPhone());
}

function findAppLanguageForPhone() {
  return (
    APP_LANGUAGE_BY_PHONE_LANGUAGE.get(getLocales()[0]?.languageCode ?? "") ??
    AppLanguage.English
  );
}
