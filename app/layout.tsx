import type { Metadata, Viewport } from "next";
// import { Geist, Geist_Mono } from "next/font/google"; // Google Fonts temporarily disabled due to fetch error
import "./globals.css";
import { ServiceWorkerRegistration } from "@/src/components/ServiceWorkerRegistration";
import { NotificationListener } from "@/src/components/chat/NotificationListener";
import { GlobalCallOverlay } from "@/src/components/chat/GlobalCallOverlay";
import { AuthGuard } from "@/src/components/AuthGuard";
import { CallProvider } from "@/src/contexts/CallContext";
import { SWRProvider } from "@/src/providers/SWRProvider";
import { OfflineBanner } from "@/src/components/chat/OfflineBanner";
import { OfflineQueueSync } from "@/src/components/chat/OfflineQueueSync";
import { ThemeProvider } from "@/src/components/ThemeProvider";
import { Toaster } from "@/src/components/ui/sonner";

/*
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
*/

export const metadata: Metadata = {
  title: "Kephale Chat",
  description: "Application de messagerie sécurisée et chiffrée",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kephale Chat",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content="Kephale Chat" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kephale" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <CallProvider>
            <SWRProvider>
              <ServiceWorkerRegistration />
              <NotificationListener />
              <OfflineBanner />
              <OfflineQueueSync />
              <AuthGuard />
              {children}
              <GlobalCallOverlay />
              <Toaster />
            </SWRProvider>
          </CallProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
