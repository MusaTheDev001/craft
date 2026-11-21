import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { safeColor } from "./config";

const inter = Inter({ subsets: ["latin"] });

const DEFAULT_PRIMARY_COLOR = "#6366f1";
const DEFAULT_SECONDARY_COLOR = "#8b5cf6";

const primaryColor = safeColor(process.env.NEXT_PUBLIC_PRIMARY_COLOR, DEFAULT_PRIMARY_COLOR);
const secondaryColor = safeColor(process.env.NEXT_PUBLIC_SECONDARY_COLOR, DEFAULT_SECONDARY_COLOR);

export const metadata: Metadata = {
  title: "Stellar DEX",
  description: "A decentralized exchange built on Stellar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--primary-color:${primaryColor};--secondary-color:${secondaryColor};}`,
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
