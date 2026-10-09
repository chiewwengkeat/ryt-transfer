import { useTranslation } from "react-i18next";

import {
  scenarioWordsKey,
  type TransferScenarioId,
} from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import demoEnMY from "@/mocks/switcher/i18n/en-MY.json";
import demoMsMY from "@/mocks/switcher/i18n/ms-MY.json";
import demoZhMY from "@/mocks/switcher/i18n/zh-MY.json";
import { AppLanguage } from "@/shared/i18n/i18n";

export function useDemoTranslation() {
  // Not one of the app's typed namespaces, so this t takes any key and the wrappers below type them.
  const { t, i18n } = useTranslation("demo" as never);
  // Added on first use: initialising the app's translations drops every bundle added before it.
  if (!i18n.hasResourceBundle(AppLanguage.English, "demo")) {
    i18n.addResourceBundle(AppLanguage.English, "demo", demoEnMY);
    i18n.addResourceBundle(AppLanguage.Malay, "demo", demoMsMY);
    i18n.addResourceBundle(AppLanguage.Chinese, "demo", demoZhMY);
  }
  const translate = t as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  return {
    t: (key: KeyPaths<typeof demoEnMY>, values?: Record<string, string>) =>
      translate(key, values),
    scenarioTitle: (scenarioId: `${TransferScenarioId}`) =>
      translate(`transfer:common.${scenarioWordsKey(scenarioId)}.title`),
  };
}

type KeyPaths<Strings> = {
  [Key in keyof Strings & string]: Strings[Key] extends string
    ? Key
    : `${Key}.${KeyPaths<Strings[Key]>}`;
}[keyof Strings & string];
