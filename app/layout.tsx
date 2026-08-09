import type { Metadata, Viewport } from "next";
import { Inter, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/toaster";
import { PWAPrompt } from "@/components/pwa-prompt";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "Fusion Clinic - Marketplace de Espaços",
  description: "Encontre e reserve espaços de trabalho flexíveis.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fusion Clinic",
  },
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f05e23",
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
    <html lang="pt-BR">
      <head>
        {/* ARMADILHA GLOBAL PARA O PWA: Captura o evento antes do React carregar */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.deferredPrompt = null;
              window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                window.deferredPrompt = e;
              });
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${dmSans.variable} font-sans antialiased`}
      >
        {children}
        <Analytics />
        <Toaster />
        <PWAPrompt />
      </body>
    </html>
  );
}
