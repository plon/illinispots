import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TouchProvider } from "@/components/ui/HybridTooltip";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IlliniSpots - Real-Time UIUC Study Spots & Empty Classroom Finder",
  description:
    "Find available UIUC study spaces and empty classrooms in real-time. Interactive campus map showing open rooms at University of Illinois Urbana-Champaign.",
  icons: {
    icon: [
      {
        url: "/favicon.ico",
      },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="index, follow" />
        <meta
          name="google-site-verification"
          content="VDVWq1BdAlOLD14tNM033IajP3Z_GVrXo2P23Rg3gAA"
        />
        <link rel="canonical" href="https://illinispots.vercel.app/" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className={inter.className}>
        <TouchProvider>{children}</TouchProvider>
      </body>
    </html>
  );
}
