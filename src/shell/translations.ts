import accountEnMY from "@/domains/account/i18n/en-MY.json";
import homeEnMY from "@/screens/home/i18n/en-MY.json";
import transferScreensEnMY from "@/screens/transfer/i18n/en-MY.json";
import commonEnMY from "@/shared/i18n/en-MY.json";
import { initTranslations } from "@/shared/i18n/i18n";

export const TRANSLATION_BUNDLES = {
  "en-MY": {
    common: [commonEnMY],
    account: [accountEnMY],
    home: [homeEnMY],
    transfer: [transferScreensEnMY],
  },
};

initTranslations(TRANSLATION_BUNDLES);

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof commonEnMY;
      account: typeof accountEnMY;
      home: typeof homeEnMY;
      transfer: typeof transferScreensEnMY;
    };
  }
}
