import type { Metadata, Viewport } from "next";
import { Archivo, Patrick_Hand, Kalam, Noto_Sans_Tamil, Noto_Sans_Bengali, Noto_Sans_Telugu, JetBrains_Mono } from "next/font/google";
import { SkipLink } from "@/components/shell/Common";
import "./globals.css";

// Doodle set type: Archivo for claims, Patrick Hand for handwriting, JetBrains Mono for numbers.
// Kalam (handwritten Devanagari) and Noto Sans Tamil cover Hindi and Tamil.
// Beta languages: Kalam also covers Marathi; Noto Sans Bengali and Noto Sans Telugu cover the other two.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "600", "800"] });
const hand = Patrick_Hand({ variable: "--font-hand-latin", subsets: ["latin"], weight: "400" });
const deva = Kalam({ variable: "--font-deva", subsets: ["devanagari"], weight: ["400", "700"] });
const tamil = Noto_Sans_Tamil({ variable: "--font-tamil", subsets: ["tamil"], weight: ["400", "700"] });
const bengali = Noto_Sans_Bengali({ variable: "--font-bengali", subsets: ["bengali"], weight: ["400", "700"] });
const telugu = Noto_Sans_Telugu({ variable: "--font-telugu", subsets: ["telugu"], weight: ["400", "700"] });
const mono = JetBrains_Mono({ variable: "--font-jb", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "ClarityLoop — Read is not understood", template: "%s · ClarityLoop" },
  description:
    "Work chat where each person reads and writes in their own language, and every instruction gets a meaning check before work starts.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f0ede8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${hand.variable} ${deva.variable} ${tamil.variable} ${bengali.variable} ${telugu.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col"><SkipLink />{children}</body>
    </html>
  );
}
