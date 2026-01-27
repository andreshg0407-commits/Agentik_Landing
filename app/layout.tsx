import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const siteUrl = "https://www.agentickers.com"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Agentik",
    template: "%s · Agentik",
  },
  description:
    "Empleados virtuales con IA que ejecutan tareas reales como un humano: ventas, marketing, ecommerce, reservas y operaciones.",
  applicationName: "Agentik",
  generator: "Agentik",
  authors: [{ name: "Agentik" }],
  creator: "Agentik",
  publisher: "Agentik",

  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },

  openGraph: {
    title: "Agentik",
    description:
      "Empleados virtuales con IA para ventas, marketing, ecommerce, reservas y operaciones.",
    url: siteUrl,
    siteName: "Agentik",
    locale: "es_ES",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Agentik",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Agentik",
    description:
      "Empleados virtuales con IA para ventas, marketing, ecommerce, reservas y operaciones.",
    images: ["/og.png"],
  },

  // Opcional, pero ayuda a que no indexen cosas raras si estás en beta:
  // robots: { index: true, follow: true },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body
        className={[
          GeistSans.className,
          GeistMono.variable,
          "bg-[#f7f8fa] text-[#0b1220]",
        ].join(" ")}
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}