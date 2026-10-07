import commonEnMY from "@/shared/i18n/en-MY.json";
import { initTranslations } from "@/shared/i18n/i18n";

export const TRANSLATION_BUNDLES = {
  "en-MY": { common: [commonEnMY] },
};

initTranslations(TRANSLATION_BUNDLES);

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: { common: typeof commonEnMY };
  }
}
