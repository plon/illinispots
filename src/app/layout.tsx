import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TouchProvider } from "@/components/ui/HybridTooltip";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "illiniSpots",
    absolute:
      "illiniSpots - Real-Time UIUC Study Spots & Empty Classroom Finder",
  },
  description:
    "Find available UIUC study spaces and empty classrooms in real-time. Interactive campus map showing open rooms at University of Illinois Urbana-Champaign.",
  icons: {
    icon: [
      {
        url: "/icon-16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/icon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no"
        />
        <meta name="robots" content="index, follow" />
        <meta
          name="google-site-verification"
          content="VDVWq1BdAlOLD14tNM033IajP3Z_GVrXo2P23Rg3gAA"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="illiniSpots" />
        <link rel="canonical" href="https://illinispots.vercel.app/" />
        <link rel="manifest" href="/manifest.json" />
        <link
          rel="stylesheet"
          href="https://api.mapbox.com/mapbox-gl-js/v3.5.1/mapbox-gl.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className={inter.className}>
        <Providers>
          <TouchProvider>{children}</TouchProvider>
        </Providers>
      </body>
    </html>
  );
}
