# Momentum Android — build & install

The Android app is a Capacitor wrapper around the published web app at
`https://momentua.lovable.app`. Every web update goes live on Android
without rebuilding the APK.

## Native features wired up

- **FCM push notifications** (`@capacitor/push-notifications` + FCM HTTP v1)
- **ML Kit barcode scanner** for Pantry (`@capacitor-mlkit/barcode-scanning`)
- **Status bar / splash screen / hardware back / haptics**

The web build still works unchanged — every native call is guarded by
`isNative()` and falls back to the browser implementation.

---

## One-time Firebase setup (you do this)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → name it `Momentum`.
2. Inside the project → **Add app → Android**.
   - Package name: **`app.momentum`** (must match `capacitor.config.ts`)
   - App nickname: `Momentum Android`
3. Download **`google-services.json`**. Keep it — you'll upload it as a GitHub secret in step 6.
4. In Firebase → **Project settings → Service accounts → Generate new private key**. Save the JSON file. This is the Admin SDK key used by the server to send pushes.
5. **Add the server secret** (already requested below):
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = the **entire contents** of the service-account JSON file from step 4.
6. **Add the build secret to GitHub** (for the APK workflow):
   - GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `GOOGLE_SERVICES_JSON_BASE64`
   - Value: run locally
     ```bash
     base64 -w0 google-services.json   # Linux
     base64 -i google-services.json    # macOS
     ```
     and paste the output.

## Building the APK

### Option A — GitHub Actions (recommended, no local setup)

Push to `main` (or run **Actions → Android APK (debug) → Run workflow**).
When done, open the run → **Artifacts → momentum-debug-apk** → download.

Transfer to your phone (USB, Drive, email) and open it. You'll need to allow
"Install from unknown sources" the first time.

### Option B — Local

Requirements: Node/Bun, JDK 21, Android Studio (or `android-sdk` + `gradle`).

```bash
bun install
bun run build           # optional — webDir is unused since we use server.url
bunx cap add android
bunx cap sync android
cp /path/to/google-services.json android/app/google-services.json
bunx cap open android   # opens Android Studio → Build → Build APK
# or headless:
cd android && ./gradlew assembleDebug
# APK at android/app/build/outputs/apk/debug/app-debug.apk
```

## Publishing to Play Store later

You'll need a signed release AAB:
1. Generate a keystore: `keytool -genkey -v -keystore release.keystore -alias momentum -keyalg RSA -keysize 2048 -validity 10000`
2. Configure `android/app/build.gradle` `signingConfigs.release`
3. `./gradlew bundleRelease` → upload the AAB to Play Console ($25 one-time dev account)

---

## How push works end-to-end

1. App boots on Android → `initNative()` requests permission → `PushNotifications.register()` → FCM returns a device token.
2. App calls `upsertFcmToken` serverFn → stored in `fcm_tokens` table.
3. The 5-minute cron pings `/api/public/hooks/send-notifications`, which now fans out to **both** `push_subscriptions` (web) **and** `fcm_tokens` (Android) for each user.
4. Server signs an RS256 JWT from `FIREBASE_SERVICE_ACCOUNT_JSON`, exchanges for an OAuth2 token, and POSTs each message to `fcm.googleapis.com/v1/projects/{id}/messages:send`.
5. Tap on the Android notification → app navigates to `data.url`.

## Troubleshooting

- **"Default FirebaseApp is not initialized"** → `google-services.json` is missing or has the wrong package name (must be `app.momentum`).
- **APK installs but no push** → check `FIREBASE_SERVICE_ACCOUNT_JSON` is set on the server (Lovable Cloud secrets).
- **403 from FCM** → the service-account JSON doesn't belong to the same Firebase project as `google-services.json`.
- **Barcode scanner crashes** → ML Kit downloads its model on first use; needs internet on first scan.
