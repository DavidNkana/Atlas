import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeBootstrapper } from "@/components/ThemeBootstrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — AI Operating System for builders and investors",
  description:
    "Atlas blends multiple data sources, models, and live signals to help African builders, operators, and investors find the right place to build, operate, or invest.",
  icons: {
    icon: [{ url: "/AI.png", type: "image/png" }],
    shortcut: "/AI.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <html lang="en" className="dark">
        <head>
          {/* Sep 2026 MVP — Ndebele landing page typography. Inter for
              body, Space Grotesk for display titles (matches the SAFAI
              reference style). */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin=""
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="min-h-screen bg-atlas-bg text-atlas-text font-sans antialiased">
          <ThemeBootstrapper />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
