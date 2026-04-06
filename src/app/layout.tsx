import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";


const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ComunidadConnect — Gestión Comunitaria Inteligente",
    template: "%s | ComunidadConnect",
  },
  description:
    "Plataforma premium de gestión comunitaria para condominios. Marketplace, reservas de amenidades, consumo de agua, votaciones y más. Digitaliza tu comunidad.",
  keywords: [
    "condominio",
    "gestión comunitaria",
    "comunidad",
    "marketplace",
    "amenidades",
    "gastos comunes",
    "agua",
    "administración",
  ],
  authors: [{ name: "ComunidadConnect" }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ComunidadConnect',
  },
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "ComunidadConnect",
    title: "ComunidadConnect — Gestión Comunitaria Inteligente",
    description:
      "Digitaliza la convivencia en tu condominio. Marketplace, reservas, gastos comunes y mucho más.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#6366f1" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0B0F19" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body
        className={`${plusJakarta.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}

        </Providers>
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').catch(console.error);
              });
            }
          `
        }} />
      </body>
    </html>
  );
}
