import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: "AlphaGovernor — Autonomous Capital Command Center",
  description: "The operating system that hires, funds, evaluates, and fires AI trading agents.",
  openGraph: {
    title: "AlphaGovernor — Autonomous Capital Command Center",
    description: "Hires. Funds. Evaluates. Fires. The Risk Constitution stays in command.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlphaGovernor",
    description: "The operating system that governs AI traders.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${inter.variable} ${mono.variable}`}>{children}</body></html>;
}
