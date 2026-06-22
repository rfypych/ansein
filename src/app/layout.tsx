import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/ansein/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sigurd = localFont({
  src: "../../public/fonts/sigurd.woff2",
  variable: "--font-sigurd",
  display: "swap",
});

const courier = localFont({
  src: "../../public/fonts/courier.woff2",
  variable: "--font-courier",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AnseIn — Advanced Neural Security Extractor Intelligence",
  description:
    "A CTI/OSINT platform that extracts, enriches, and visualises threat intelligence — then writes the report for you.",
  keywords: [
    "AnseIn",
    "CTI",
    "OSINT",
    "Threat Intelligence",
    "Cyber Security",
    "IOC",
    "STIX",
    "Investigation",
  ],
  authors: [{ name: "AnseIn" }],
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
  },
  openGraph: {
    title: "AnseIn — Threat Intelligence Platform",
    description:
      "Turn raw threat data into decisions. Hybrid extraction, knowledge graph, cognitive analysis, RAG copilot.",
    type: "website",
  },
};

import { LenisProvider } from "@/components/ansein/lenis-provider";
import { ThemeProvider } from "@/components/ansein/theme-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${sigurd.variable} ${courier.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LenisProvider>
            <QueryProvider>{children}</QueryProvider>
            <Toaster />
            <SonnerToaster position="bottom-right" theme="system" />
          </LenisProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
