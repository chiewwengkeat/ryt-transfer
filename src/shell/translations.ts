import accountEnMY from "@/domains/account/i18n/en-MY.json";
import accountMsMY from "@/domains/account/i18n/ms-MY.json";
import accountZhMY from "@/domains/account/i18n/zh-MY.json";
import approvalEnMY from "@/domains/approval/i18n/en-MY.json";
import approvalMsMY from "@/domains/approval/i18n/ms-MY.json";
import approvalZhMY from "@/domains/approval/i18n/zh-MY.json";
import transferDomainEnMY from "@/domains/transfer/i18n/en-MY.json";
import transferDomainMsMY from "@/domains/transfer/i18n/ms-MY.json";
import transferDomainZhMY from "@/domains/transfer/i18n/zh-MY.json";
import homeEnMY from "@/screens/home/i18n/en-MY.json";
import homeMsMY from "@/screens/home/i18n/ms-MY.json";
import homeZhMY from "@/screens/home/i18n/zh-MY.json";
import transferScreensEnMY from "@/screens/transfer/i18n/en-MY.json";
import transferScreensMsMY from "@/screens/transfer/i18n/ms-MY.json";
import transferScreensZhMY from "@/screens/transfer/i18n/zh-MY.json";
import commonEnMY from "@/shared/i18n/en-MY.json";
import commonMsMY from "@/shared/i18n/ms-MY.json";
import commonZhMY from "@/shared/i18n/zh-MY.json";
import { initTranslations } from "@/shared/i18n/i18n";

export const TRANSLATION_BUNDLES = {
  "en-MY": {
    common: [commonEnMY],
    account: [accountEnMY],
    approval: [approvalEnMY],
    home: [homeEnMY],
    transfer: [transferScreensEnMY, transferDomainEnMY],
  },
  "ms-MY": {
    common: [commonMsMY],
    account: [accountMsMY],
    approval: [approvalMsMY],
    home: [homeMsMY],
    transfer: [transferScreensMsMY, transferDomainMsMY],
  },
  "zh-MY": {
    common: [commonZhMY],
    account: [accountZhMY],
    approval: [approvalZhMY],
    home: [homeZhMY],
    transfer: [transferScreensZhMY, transferDomainZhMY],
  },
};

initTranslations(TRANSLATION_BUNDLES);

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof commonEnMY;
      account: typeof accountEnMY;
      approval: typeof approvalEnMY;
      home: typeof homeEnMY;
      transfer: typeof transferScreensEnMY & typeof transferDomainEnMY;
    };
  }
}
