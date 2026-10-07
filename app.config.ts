import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Ryt Transfer",
  slug: "ryt-transfer",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "ryt",
  userInterfaceStyle: "light",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: "io.github.chiewwengkeat.ryttransfer",
    infoPlist: {
      NSFaceIDUsageDescription: "$(PRODUCT_NAME) uses Face ID to approve your transfers.",
    },
  },
  android: {
    package: "io.github.chiewwengkeat.ryttransfer",
    allowBackup: false,
    blockedPermissions: ["android.permission.WRITE_CONTACTS"],
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
