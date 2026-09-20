import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Build Pipeline",
  description: "Absorption and lock steps for the AI ads build order.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
