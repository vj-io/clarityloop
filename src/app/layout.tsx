import type { Metadata, Viewport } from "next";
import { Archivo, Patrick_Hand, Kalam, Noto_Sans_Tamil, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Doodle set type: Archivo for claims, Patrick Hand for handwriting, JetBrains Mono for numbers.
// Kalam (handwritten Devanagari) and Noto Sans Tamil cover Hindi and Tamil.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "600", "800"] });
const hand = Patrick_Hand({ variable: "--font-hand-latin", subsets: ["latin"], weight: "400" });
const deva = Kalam({ variable: "--font-deva", subsets: ["devanagari"], weight: ["400", "700"] });
const tamil = Noto_Sans_Tamil({ variable: "--font-tamil", subsets: ["tamil"], weight: ["400", "700"] });
const mono = JetBrains_Mono({ variable: "--font-jb", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "ClarityLoop — Read is not understood",
  description:
    "Work chat where each person reads and writes in their own language, and every instruction gets a meaning check before work starts.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f0ede8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${hand.variable} ${deva.variable} ${tamil.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
