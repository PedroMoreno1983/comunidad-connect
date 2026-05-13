import type { Metadata, Viewport } from "next";
import { Hedvig_Letters_Sans, Liter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProviders } from "@/components/ThemeProviders";


const hedvigLetters = Hedvig_Letters_Sans({
  variable: "--font-hedvig",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: true,
});

const liter = Liter({
  variable: "--font-liter",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Convive",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Plataforma de bienestar comunitario para condominios: gastos comunes, reservas, conserjeria, votaciones, marketplace y comunicacion vecinal.",
  offers: {
    "@type": "Offer",
    priceCurrency: "CLP",
    price: "19990",
  },
  publisher: {
    "@type": "Organization",
    name: "Convive",
  },
};

export const metadata: Metadata = {
  title: {
    default: "Convive — Bienestar Comunitario",
    template: "%s | Convive",
  },
  description:
    "Plataforma de bienestar comunitario para condominios. Marketplace, reservas de amenidades, consumo de agua, votaciones y más. Convierte tu edificio en comunidad.",
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
  authors: [{ name: "Convive" }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Convive',
  },
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Convive",
    title: "Convive — Bienestar Comunitario",
    description:
      "Más que vecinos. Comunidad. Marketplace, reservas, gastos comunes y bienestar comunitario.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF8F3" },
    { media: "(prefers-color-scheme: dark)", color: "#1E1E24" },
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
        <meta name="theme-color" content="#FBF8F3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1E1E24" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body
        className={`${hedvigLetters.variable} ${liter.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProviders>
          {children}

        </ThemeProviders>
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
