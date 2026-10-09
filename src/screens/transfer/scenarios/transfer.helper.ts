import { AppLanguage } from "@/shared/i18n/i18n";

// Jest defines it; the app's types deliberately leave out Node's globals.
// eslint-disable-next-line fe/file-layout -- read at load by matrixHeader
declare const __dirname: string;

export const [matrixHeader = "", ...stepChunks] = jest
  .requireActual<{
    readFileSync: (path: string, encoding: "utf8") => string;
  }>("node:fs")
  .readFileSync(`${__dirname}/transfer.md`, "utf8")
  .split(/^## /m);
export const parsedSteps = stepChunks.map((chunk) => {
  const [stepName = "", ...sectionChunks] = chunk.split(/^### /m);
  return {
    name: stepName.trim(),
    sections: sectionChunks.map((section) => {
      const [heading = "", idLine = "", ...body] = section.trim().split("\n");
      return {
        heading,
        id: /^`([^`]+)`$/.exec(idLine)?.[1] ?? `(no id under ${heading})`,
        labels: body.flatMap((line) => {
          const [, name, value] =
            /^[-*] \*\*([^*]+):\*\* (.+)$/.exec(line) ?? [];
          return name && value ? [{ name, value }] : [];
        }),
      };
    }),
  };
});
export const scenarioSections = parsedSteps.flatMap((step) => step.sections);
export const MONEY_PHRASES = [
  ...matrixHeader.matchAll(/^\| ([a-z ]+) \| (\S[^|]*?) \| (\S[^|]*?) \|$/gm),
].map(([, english = "", malay = "", chinese = ""]) => ({
  [AppLanguage.English]: english,
  [AppLanguage.Malay]: malay,
  [AppLanguage.Chinese]: chinese,
}));
export const RETRY_WORDS = [
  ...matrixHeader.matchAll(/^\| ([^|]+?) \| (\w+) \|$/gm),
].flatMap(([, word = "", languageName = ""]) => {
  const language = Object.entries(AppLanguage).find(
    ([name]) => name === languageName,
  )?.[1];
  return language === undefined ? [] : [{ word, language }];
});
export const RESEND_BAN = "offer to send it again";
