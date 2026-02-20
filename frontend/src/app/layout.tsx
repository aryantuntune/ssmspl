import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Suvarnadurga Shipping & Marine Services - Ferry Boat Ticketing",
  description:
    "Maharashtra's premier ferry service connecting the Konkan coast since 2003. Book ferry tickets for Dabhol-Dhopave, Jaigad-Tawsal, Dighi-Agardande, and more routes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
