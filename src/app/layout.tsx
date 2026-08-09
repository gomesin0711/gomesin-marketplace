import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "Gomesin — Jual baru/bekas Mesin Cetak, Mesin Industri & Jasa Teknisi Berkualitas",
  description:
    "Gomesin adalah marketplace mesin industri terlengkap di Indonesia. Beli & jual mesin cetak, CNC, laser, woodworking, food processing, kompresor, generator, dan sparepart mesin bekas & baru.",
  keywords: [
    "gomesin",
    "jual mesin industri",
    "mesin cetak",
    "mesin CNC",
    "mesin laser",
    "mesin bekas",
    "sparepart mesin",
    "marketplace mesin",
  ],
  authors: [{ name: "Gomesin" }],
  openGraph: {
    title: "Gomesin — Marketplace Mesin Industri",
    description: "Jual beli mesin industri, mesin cetak, CNC & sparepart mesin di Indonesia.",
    siteName: "Gomesin",
    type: "website",
    images: [{ url: "/pwa-icon-512.png", width: 512, height: 512 }],
  },
  manifest: "/manifest.json",
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "Gomesin",
    "theme-color": "#F57C00",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F57C00" />
        <meta name="application-name" content="Gomesin" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Gomesin" />
        <link rel="apple-touch-icon" href="/pwa-icon-180.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/pwa-icon-152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/pwa-icon-120.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/pwa-icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/pwa-icon-512.png" />
        <link rel="preload" href="/logo-sm.jpeg" as="image" type="image/jpeg" />
        <style dangerouslySetInnerHTML={{ __html: `:root{--radius:.75rem;--background:oklch(.99 .008 75);--foreground:oklch(.21 .02 45);--card:oklch(1 0 0);--card-foreground:oklch(.21 .02 45);--popover:oklch(1 0 0);--popover-foreground:oklch(.21 .02 45);--primary:oklch(.68 .17 55);--primary-foreground:oklch(.99 .005 75);--secondary:oklch(.96 .02 75);--secondary-foreground:oklch(.30 .05 45);--muted:oklch(.965 .012 75);--muted-foreground:oklch(.50 .03 55);--accent:oklch(.93 .04 65);--accent-foreground:oklch(.30 .07 45);--destructive:oklch(.58 .22 27);--border:oklch(.91 .01 75);--input:oklch(.91 .01 75);--ring:oklch(.68 .17 55);--chart-1:oklch(.68 .17 55);--chart-2:oklch(.70 .13 40);--chart-3:oklch(.75 .15 30);--chart-4:oklch(.78 .12 80);--chart-5:oklch(.65 .16 20);--sidebar:oklch(.985 .008 75);--sidebar-foreground:oklch(.21 .02 45);--sidebar-primary:oklch(.68 .17 55);--sidebar-primary-foreground:oklch(.99 .005 75);--sidebar-accent:oklch(.93 .04 65);--sidebar-accent-foreground:oklch(.30 .07 45);--sidebar-border:oklch(.91 .01 75);--sidebar-ring:oklch(.68 .17 55)}.dark{--background:oklch(.18 .02 55);--foreground:oklch(.97 .008 75);--card:oklch(.22 .025 55);--card-foreground:oklch(.97 .008 75);--popover:oklch(.22 .025 55);--popover-foreground:oklch(.97 .008 75);--primary:oklch(.75 .15 55);--primary-foreground:oklch(.16 .02 55);--secondary:oklch(.28 .03 55);--secondary-foreground:oklch(.97 .008 75);--muted:oklch(.28 .03 55);--muted-foreground:oklch(.72 .02 75);--accent:oklch(.32 .06 55);--accent-foreground:oklch(.95 .02 75);--destructive:oklch(.70 .19 22);--border:oklch(1 0 0/12%);--input:oklch(1 0 0/16%);--ring:oklch(.75 .15 55);--chart-1:oklch(.75 .15 55);--chart-2:oklch(.70 .13 40);--chart-3:oklch(.75 .15 30);--chart-4:oklch(.78 .12 80);--chart-5:oklch(.65 .16 20);--sidebar:oklch(.22 .025 55);--sidebar-foreground:oklch(.97 .008 75);--sidebar-primary:oklch(.75 .15 55);--sidebar-primary-foreground:oklch(.16 .02 55);--sidebar-accent:oklch(.32 .06 55);--sidebar-accent-foreground:oklch(.95 .02 75);--sidebar-border:oklch(1 0 0/12%);--sidebar-ring:oklch(.75 .15 55)}` }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Capture beforeinstallprompt IMMEDIATELY before React hydrates
              window.__deferredInstallPrompt = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.__deferredInstallPrompt = e;
                console.log('[PWA] beforeinstallprompt captured early');
              });
              window.addEventListener('appinstalled', function() {
                window.__deferredInstallPrompt = null;
                try { localStorage.setItem('gomesin-pwa-installed', '1'); } catch(ex) {}
                console.log('[PWA] app installed');
              });
              // Register SW
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function(reg) {
                    console.log('SW registered:', reg.scope);
                  }).catch(function(err) {
                    console.warn('SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body className={`${spaceGrotesk.variable} font-sans antialiased bg-background text-foreground overflow-x-hidden`}>
        <Providers>{children}</Providers>
        <Toaster />
        <SonnerToaster richColors position="top-center" />
      </body>
    </html>
  );
}
