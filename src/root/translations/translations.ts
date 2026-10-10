import accountEnMY from "@/domains/account/i18n/en-MY.json";
import accountMsMY from "@/domains/account/i18n/ms-MY.json";
import accountZhMY from "@/domains/account/i18n/zh-MY.json";
import transferDomainEnMY from "@/domains/transfer/i18n/en-MY.json";
import transferDomainMsMY from "@/domains/transfer/i18n/ms-MY.json";
import transferDomainZhMY from "@/domains/transfer/i18n/zh-MY.json";
import homeEnMY from "@/screens/home/i18n/en-MY.json";
import homeMsMY from "@/screens/home/i18n/ms-MY.json";
import homeZhMY from "@/screens/home/i18n/zh-MY.json";
import transferScreensEnMY from "@/screens/transfer/i18n/en-MY.json";
import transferScreensMsMY from "@/screens/transfer/i18n/ms-MY.json";
import transferScreensZhMY from "@/screens/transfer/i18n/zh-MY.json";
import sharedEnMY from "@/shared/i18n/en-MY.json";
import sharedMsMY from "@/shared/i18n/ms-MY.json";
import sharedZhMY from "@/shared/i18n/zh-MY.json";
import { initTranslations } from "@/shared/i18n/i18n";

export const TRANSLATION_BUNDLES = {
  "en-MY": {
    shared: [sharedEnMY],
    account: [accountEnMY],
    home: [homeEnMY],
    transfer: [transferScreensEnMY, transferDomainEnMY],
  },
  "ms-MY": {
    shared: [sharedMsMY],
    account: [accountMsMY],
    home: [homeMsMY],
    transfer: [transferScreensMsMY, transferDomainMsMY],
  },
  "zh-MY": {
    shared: [sharedZhMY],
    account: [accountZhMY],
    home: [homeZhMY],
    transfer: [transferScreensZhMY, transferDomainZhMY],
  },
};

initTranslations(TRANSLATION_BUNDLES);

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: false;
    resources: {
      shared: typeof sharedEnMY;
      account: typeof accountEnMY;
      home: typeof homeEnMY;
      transfer: typeof transferScreensEnMY & typeof transferDomainEnMY;
    };
  }
}
