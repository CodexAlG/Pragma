import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppLayout from "../components/AppLayout";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pragma — Day Orchestrator",
  description: "Vuelca tu día. Orquesta tu enfoque.",
  icons: {
    icon: "/origami_p_icon.png",
    apple: "/origami_p_icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pragma",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c6fe0" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-text-primary antialiased">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
