import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { InstallPrompt } from "@/components/InstallPrompt";
import appCss from "../styles.css?url";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center">
        <h1 className="font-display text-7xl font-black text-primary">404</h1>
        <p className="mt-3 text-muted-foreground">Off-track. Get back to momentum.</p>
        <a href="/" className="mt-6 inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Go home</a>
      </div>
    </div>
  );
}

function ErrorComp({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-3xl font-bold">Something broke.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "google-site-verification", content: "O7b2v9N-FGYSQGsS3Q0AncgZQJHXmjdtlBHx6mmvMxg" },
      { name: "theme-color", content: "#0a0e1a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "MOMENTUM" },
      { name: "application-name", content: "MOMENTUM" },
      { title: "MOMENTUM — Stake your behavior. Recover your money." },
      { name: "description", content: "An AI-powered behavioral consistency engine. Real money on the line. Real recovery through what you actually do." },
      { property: "og:title", content: "MOMENTUM — Stake your behavior. Recover your money." },
      { name: "twitter:title", content: "MOMENTUM — Stake your behavior. Recover your money." },
      { property: "og:description", content: "An AI-powered behavioral consistency engine. Real money on the line. Real recovery through what you actually do." },
      { name: "twitter:description", content: "An AI-powered behavioral consistency engine. Real money on the line. Real recovery through what you actually do." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/39c2f0b1-5586-4094-9213-491e68ce2e60/id-preview-3e2bcae4--f253d09d-cef9-4fc9-b84f-039433cf0ce0.lovable.app-1778504576393.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/39c2f0b1-5586-4094-9213-491e68ce2e60/id-preview-3e2bcae4--f253d09d-cef9-4fc9-b84f-039433cf0ce0.lovable.app-1778504576393.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "MOMENTUM",
          url: "https://stakes-and-streaks.lovable.app",
          logo: "https://stakes-and-streaks.lovable.app/icon-512.png",
          description: "An AI-powered behavioral consistency engine. Stake real money on your behavior, recover it through what you actually do.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "MOMENTUM",
          url: "https://stakes-and-streaks.lovable.app",
        }),
      },
    ],
  }),
  shellComponent: ({ children }: { children: React.ReactNode }) => (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body><div id="app">{children}</div><Scripts /></body>
    </html>
  ),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComp,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    // Capacitor bootstrap (status bar, splash hide, hardware back, FCM register).
    // No-op in the browser — guarded inside initNative().
    void import("@/lib/native").then((m) => m.initNative());
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <InstallPrompt />
        <Toaster theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
