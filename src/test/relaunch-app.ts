import { changeLanguage } from "i18next";

import { AppLanguage, initTranslations } from "@/shared/i18n/i18n";
import { TRANSLATION_BUNDLES } from "@/shell/translations";

import { renderRoute } from "./render-route";

// English is forced first, so the language shown afterwards is the launch's own choice — the stored pick or the
// phone's — never one left over from before the relaunch.
export async function relaunchApp(
  view: Awaited<ReturnType<typeof renderRoute>>,
) {
  await view.unmount();
  await changeLanguage(AppLanguage.English);
  initTranslations(TRANSLATION_BUNDLES);
  return renderRoute("/");
}
