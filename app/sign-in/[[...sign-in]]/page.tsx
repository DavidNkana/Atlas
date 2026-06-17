import { SignIn } from "@clerk/nextjs";
import { AtlasLogo } from "@/components/AtlasLogo";

/**
 * Day 8 polish — Sign-in page.
 *
 * Uses Clerk's pre-built <SignIn /> component. The optional catch-all
 * segment `[[...sign-in]]` is what Clerk's path-routing uses to match
 * /sign-in, /sign-in/verify-email-address, /sign-in/sso-callback, etc.
 *
 * Why this exists: by default Clerk uses hash routing (#/sign-in) and
 * the URL path /sign-in returns Next.js 404. With routing="path" in
 * ClerkProvider (set in app/layout.tsx) and these dedicated pages,
 * /sign-in renders the form and the user can sign in normally.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-atlas-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <AtlasLogo size={48} />
          <h1 className="text-2xl font-semibold text-atlas-text">Welcome back</h1>
          <p className="text-sm text-atlas-muted">
            Sign in to continue using Atlas
          </p>
        </div>
        <div className="rounded-xl border border-atlas-border bg-atlas-surface p-2">
          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "bg-transparent shadow-none w-full",
                formButtonPrimary:
                  "bg-atlas-accent hover:bg-atlas-accent2 text-white",
                footerActionLink: "text-atlas-accent hover:text-atlas-accent2",
                formFieldInput:
                  "bg-atlas-bg border-atlas-border text-atlas-text",
                formFieldLabel: "text-atlas-muted",
                identityPreviewText: "text-atlas-text",
                identityPreviewEditButton: "text-atlas-accent",
                formFieldAction: "text-atlas-accent",
                socialButtonsBlockButton:
                  "bg-atlas-bg border-atlas-border text-atlas-text hover:bg-atlas-surface2",
                socialButtonsBlockButtonText: "text-atlas-text",
                dividerLine: "bg-atlas-border",
                dividerText: "text-atlas-muted",
                formResendCodeLink: "text-atlas-accent",
                otpCodeFieldInput:
                  "bg-atlas-bg border-atlas-border text-atlas-text",
                alert: "bg-red-500/10 border-red-500/30 text-red-300",
                alertText: "text-red-300",
                formFieldErrorText: "text-red-300",
                footer: "bg-transparent",
                footerText: "text-atlas-muted",
              },
            }}
            signUpUrl="/sign-up"
            forceRedirectUrl="/"
            fallbackRedirectUrl="/"
          />
        </div>
        <p className="mt-4 text-center text-xs text-atlas-muted">
          New to Atlas?{" "}
          <a href="/sign-up" className="text-atlas-accent hover:underline">
            Create an account
          </a>
        </p>
      </div>
    </main>
  );
}
