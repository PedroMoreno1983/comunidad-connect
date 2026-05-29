import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProviders } from "@/components/ThemeProviders";
import { AppProviders } from "@/components/AppProviders";
import { PUBLIC_SITE_URL } from "@/lib/config";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Convive Connect",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Plataforma de bienestar comunitario para condominios: gastos comunes, reservas, conserjeria, votaciones, marketplace y comunacion vecinal.",
  offers: {
    "@type": "Offer",
    priceCurrency: "CLP",
    price: "19990",
  },
  publisher: {
    "@type": "Organization",
    name: "Convive Connect",
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  title: {
    default: "Convive Connect - Tu edificio, mas humano que nunca",
    template: "%s | Convive Connect",
  },
  description:
    "Plataforma de bienestar comunitario para condominios. Gastos comunes, reservas, conserjeria, votaciones, marketplace y CoCo IA en una sola experiencia.",
  keywords: [
    "condominio",
    "gestion comunitaria",
    "comunidad",
    "marketplace",
    "amenidades",
    "gastos comunes",
    "agua",
    "administracion",
  ],
  authors: [{ name: "Convive Connect" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Convive Connect",
  },
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Convive Connect",
    title: "Convive Connect - Tu edificio, mas humano que nunca",
    description:
      "Gastos comunes, reservas, conserjeria, votaciones, marketplace y CoCo IA para comunidades residenciales.",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "Convive Connect",
      },
    ],
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
      <body className="antialiased">
        <ThemeProviders>
          <AppProviders>
            {children}
          </AppProviders>
        </ThemeProviders>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(console.error);
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
