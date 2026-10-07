module.exports = {
  "*.{js,mjs,ts,tsx}": [
    "eslint --fix --max-warnings 0 --no-warn-ignored",
    "prettier --write",
  ],
  "*.{json,md,yml,yaml}": "prettier --write",
  "*": ["secretlint", () => "node scripts/check-placement-ladder.js"],
};
