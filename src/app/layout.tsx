import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
