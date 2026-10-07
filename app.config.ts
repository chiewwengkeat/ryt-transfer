import type { ExpoConfig } from "expo/config";

const VARIANTS: Record<
  string,
  { name: string; idSuffix: string; scheme: string }
> = {
  production: { name: "Ryt Transfer", idSuffix: "", scheme: "ryt" },
  demo: { name: "Ryt Transfer Demo", idSuffix: ".demo", scheme: "ryt-demo" },
  development: {
    name: "Ryt Transfer Dev",
    idSuffix: ".dev",
    scheme: "ryt-dev",
  },
};
// Unset or empty fails closed: a forgotten variable builds an app with no fake bank.
const appVariant = process.env.EXPO_PUBLIC_APP_VARIANT || "production";
const variant = Object.hasOwn(VARIANTS, appVariant)
  ? VARIANTS[appVariant]
  : undefined;
if (!variant) {
  throw new Error(
    `EXPO_PUBLIC_APP_VARIANT must be production, demo or development, not "${appVariant}".`,
  );
}
const appId = `io.github.chiewwengkeat.ryttransfer${variant.idSuffix}`;

const config: ExpoConfig = {
  name: variant.name,
  slug: "ryt-transfer",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: variant.scheme,
  userInterfaceStyle: "light",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: appId,
    // Not a plugin option: two plugins write this key, and each keeps a value already set.
    infoPlist: {
      NSFaceIDUsageDescription:
        "$(PRODUCT_NAME) uses Face ID to approve your transfers.",
    },
  },
  android: {
    package: appId,
    allowBackup: false,
    // The prebuild template and libraries request these, and the app uses none: it reads only the
    // contact a person picks and never draws over other apps or opens shared files.
    // Never block DETECT_SCREEN_CAPTURE: expo-screen-capture listens for screenshots from launch,
    // imported or not, and without the permission every Android 14+ launch crashes.
    blockedPermissions: [
      "android.permission.WRITE_CONTACTS",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_IMAGES",
    ],
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "@sbaiahmed1/react-native-biometrics",
    "expo-secure-store",
    [
      "expo-contacts",
      {
        contactsPermission:
          "$(PRODUCT_NAME) reads only the contact you pick, to send money to their phone number.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
