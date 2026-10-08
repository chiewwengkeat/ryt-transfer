import accountEnMY from "@/domains/account/i18n/en-MY.json";
import approvalEnMY from "@/domains/approval/i18n/en-MY.json";
import transferDomainEnMY from "@/domains/transfer/i18n/en-MY.json";
import homeEnMY from "@/screens/home/i18n/en-MY.json";
import transferScreensEnMY from "@/screens/transfer/i18n/en-MY.json";
import commonEnMY from "@/shared/i18n/en-MY.json";
import { initTranslations } from "@/shared/i18n/i18n";

export const TRANSLATION_BUNDLES = {
  "en-MY": {
    common: [commonEnMY],
    account: [accountEnMY],
    approval: [approvalEnMY],
    home: [homeEnMY],
    transfer: [transferScreensEnMY, transferDomainEnMY],
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
