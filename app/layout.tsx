import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { NavigationLoader } from "@/components/NavigationLoader";
import { ThemeBootstrapper } from "@/components/ThemeBootstrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — AI Operating System for builders and investors",
  description:
    "Atlas blends multiple data sources, models, and live signals to help African builders, operators, and investors find the right place to build, operate, or invest.",
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
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <html lang="en" className="dark">
        <body className="min-h-screen bg-atlas-bg text-atlas-text font-sans antialiased">
          <ThemeBootstrapper />
          <NavigationLoader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
