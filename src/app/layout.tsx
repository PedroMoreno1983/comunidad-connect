import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProviders } from "@/components/ThemeProviders";
import { AppProviders } from "@/components/AppProviders";
import { CANONICAL_SITE_URL } from "@/lib/config";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Convive Connect",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Plataforma de bienestar comunitario para condominios: gastos comunes, reservas, conserjeria, votaciones, CoCo IA, WhatsApp y convivencia vecinal.",
  offers: {
    "@type": "Offer",
    priceCurrency: "CLP",
    price: "19990",
  },
  publisher: {
    "@type": "Organization",
    name: "Convive Connect",
    url: CANONICAL_SITE_URL,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "soporte@conviveconnect.com",
      areaServed: "CL",
      availableLanguage: ["es-CL"],
    },
  },
};

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Que permite gestionar Convive Connect?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Convive Connect centraliza gastos comunes, reservas, comunicaciones, votaciones, marketplace vecinal, soporte por WhatsApp, CoCo IA y herramientas de convivencia comunitaria para condominios en Chile.",
      },
    },
    {
      "@type": "Question",
      name: "Convive Connect sirve para administradores y residentes?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Si. La plataforma separa permisos para administradores, residentes, conserjeria y superadministracion, con acceso por rol y datos protegidos.",
      },
    },
    {
      "@type": "Question",
      name: "CoCo IA puede ayudar por WhatsApp?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Si. CoCo puede operar por WhatsApp mediante Twilio, con verificacion por telefono, opt-in del residente y unidad asociada.",
      },
    },
  ],
};

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_SITE_URL),
  title: {
    default: "Convive Connect - Tu edificio, mas humano que nunca",
    template: "%s | Convive Connect",
  },
  description:
    "Plataforma de bienestar comunitario para condominios. Gastos comunes, reservas, conserjeria, votaciones, marketplace y CoCo IA en una sola experiencia.",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "condominio",
    "gestion comunitaria",
    "comunidad",
    "marketplace",
    "amenidades",
    "gastos comunes",
    "agua",
    "administracion",
    "Ley 21.442",
    "administracion de condominios Chile",
    "software para condominios",
    "WhatsApp para comunidades",
    "mediacion vecinal",
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
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Convive Connect",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Convive Connect - Tu edificio, mas humano que nunca",
    description: "Gestion comunitaria, CoCo IA, WhatsApp y convivencia vecinal para condominios en Chile.",
    images: ["/opengraph-image"],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
        />
        {GA_ID ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_ID}', { anonymize_ip: true });
                `,
              }}
            />
          </>
        ) : null}
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
