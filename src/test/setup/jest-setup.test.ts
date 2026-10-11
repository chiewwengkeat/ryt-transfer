import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import i18next from "i18next";

// ⛔ Keep these two in this order: the second sees what the first leaves behind.
it("lets a test switch the app to Malay", () => {
  pickAppLanguage(AppLanguage.Malay);

  expect(i18next.language).toBe(AppLanguage.Malay);
});

it("starts the next test in the language the app launched in", () => {
  expect(i18next.language).toBe(AppLanguage.English);
});
