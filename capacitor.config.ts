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
    // App content stays in the WebView. Google OAuth uses native Custom Tabs
    // from src/lib/native.ts so it complies with Google's secure browser policy.
    allowNavigation: [
      "momentua.lovable.app",
      "*.lovable.app",
      "*.supabase.co",
      "iianmvufltlxajdxxyiy.supabase.co",
    ],
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
