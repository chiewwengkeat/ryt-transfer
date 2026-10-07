// Sets, not object keys: a lookup must never find `constructor` or `__proto__`.
const BUILD_VARIANTS = new Set(["production", "demo", "development"]);
const SWITCHER_VARIANTS = new Set(["demo", "development"]);

// Unset or empty fails closed, as production.
const buildVariant = process.env.EXPO_PUBLIC_APP_VARIANT || "production";
if (!BUILD_VARIANTS.has(buildVariant)) {
  throw new Error(
    `EXPO_PUBLIC_APP_VARIANT must be production, demo or development, not "${buildVariant}".`,
  );
}

// ⛔ Never gate code a build must strip on this: Metro strips only a literal variant comparison.
export const isProductionBuild = !SWITCHER_VARIANTS.has(buildVariant);

// A reserved name that never resolves: no backend exists, so a production build reaches nothing.
export const API_BASE_URL = "https://api.ryt-transfer.invalid";
