import {
  scenarioWordsKey,
  type TransferScenarioId,
} from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import demoEnMY from "@/mocks/switcher/i18n/en-MY.json";
import demoMsMY from "@/mocks/switcher/i18n/ms-MY.json";
import demoZhMY from "@/mocks/switcher/i18n/zh-MY.json";
import { AppLanguage } from "@/shared/i18n/i18n";
import { useTranslation } from "react-i18next";

export function useDemoTranslation() {
  // Not one of the app's typed namespaces, so the cast below types its keys against the English bundle.
  const { t, i18n } = useTranslation("demo" as never);
  // Added on first use: initialising the app's translations drops every bundle added before it.
  if (!i18n.hasResourceBundle(AppLanguage.English, "demo")) {
    i18n.addResourceBundle(AppLanguage.English, "demo", demoEnMY);
    i18n.addResourceBundle(AppLanguage.Malay, "demo", demoMsMY);
    i18n.addResourceBundle(AppLanguage.Chinese, "demo", demoZhMY);
  }
  const translate = t as unknown as (
    key: KeyPaths<typeof demoEnMY>,
    values?: Record<string, string>,
  ) => string;
  return {
    t: translate,
    scenarioTitle: (scenarioId: `${TransferScenarioId}`) =>
      translate(`common.${scenarioWordsKey(scenarioId)}.title`),
  };
}

type KeyPaths<Strings> = {
  [Key in keyof Strings & string]: Strings[Key] extends string
    ? Key
    : `${Key}.${KeyPaths<Strings[Key]>}`;
}[keyof Strings & string];
