import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — Intelligence for African Real Estate",
  description:
    "Atlas blends multiple data sources, models, and live signals to help land developers, property investors, and builders find the right plot in 30 seconds instead of 6 weeks.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="min-h-screen bg-atlas-bg text-atlas-text font-sans antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
