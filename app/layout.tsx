import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — Intelligence Engine",
  description: "An AI-powered Intelligence Engine for complex real-world questions.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-atlas-bg text-atlas-text font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
