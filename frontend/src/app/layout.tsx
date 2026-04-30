import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import AuthGuard from "@/components/AuthGuard";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PersonaForge | Virtual Survey Platform",
  description: "Advanced synthetic persona generation and simulated survey platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen antialiased flex flex-col`}>
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}
