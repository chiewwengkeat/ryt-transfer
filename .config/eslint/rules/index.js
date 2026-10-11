module.exports = {
  rules: {
    "component-layout": require("./component-layout"),
    "component-jsdoc-length": require("./component-jsdoc-length"),
    "component-own-folder": require("./component-own-folder"),
    "hook-file-kebab-case": require("./hook-file-kebab-case"),
    "component-type-prefix": require("./component-type-prefix"),
    "sibling-basename-tracks-folder": require("./sibling-basename-tracks-folder"),
    "hook-filename-matches-export": require("./hook-filename-matches-export"),
    "singular-role-suffix": require("./singular-role-suffix"),
    "no-component-fetch-hooks": require("./no-component-fetch-hooks"),
    "no-cross-component-internals": require("./no-cross-component-internals"),
    "component-folder-identity": require("./component-folder-identity"),
    "file-layout": require("./file-layout"),
    "no-blank-line-between-imports": require("./no-blank-line-between-imports"),
  },
};
