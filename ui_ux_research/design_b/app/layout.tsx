import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Puttential — Design B",
  description: "A monochrome daily physics puzzle mockup for Puttential.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
