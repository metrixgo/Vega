import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "Vega Safety Manager",
  description: "Event safety coordination for real-time check-ins and emergency management",
  icons: {
    icon: "/favicon.ico",
    apple: "/images/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-slate-800 selection:text-white bg-slate-50 min-h-screen">{children}</body>
    </html>
  );
}
