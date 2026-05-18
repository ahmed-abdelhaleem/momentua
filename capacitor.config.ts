import type { CapacitorConfig } from "@capacitor/cli";

// Android wrapper. The native shell loads the published web app.
// `server.url` makes it a thin WebView around the live site so every
// frontend update ships to Android automatically without rebuilding the APK.
const config: CapacitorConfig = {
  appId: "app.momentum",
  appName: "Momentum",
  webDir: "dist", // unused with server.url, but required by Capacitor
  server: {
    url: "https://momentua.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
