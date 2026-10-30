import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Indie Hustle Interviews",
  description: "Founder interviews for Indie Hustle.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script defer src="https://umami-production-7ba9.up.railway.app/script.js" data-website-id="fef4f3b3-19d9-48db-ba3e-47451b92ee57" data-domains="indieinterviewer.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
