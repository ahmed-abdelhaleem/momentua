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
    // Keep OAuth flows inside the WebView so the redirect lands back in the app.
    // Without this, Capacitor punts these hosts to the system browser and the
    // post-login redirect never returns to the native shell.
    allowNavigation: [
      "momentua.lovable.app",
      "*.lovable.app",
      "oauth.lovable.app",
      "accounts.google.com",
      "*.google.com",
      "*.googleusercontent.com",
      "appleid.apple.com",
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
