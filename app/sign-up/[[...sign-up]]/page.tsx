import { SignUp } from "@clerk/nextjs";
import { AtlasLogo } from "@/components/AtlasLogo";

/**
 * Day 8 polish — Sign-up page.
 *
 * Mirrors the sign-in page: uses Clerk's pre-built <SignUp /> with the
 * optional catch-all segment so all sign-up sub-routes (verify-email,
 * sso-callback, etc.) hit the same component.
 */
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-atlas-bg px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <AtlasLogo size={48} />
          <h1 className="text-2xl font-semibold text-atlas-text">
            Create your account
          </h1>
          <p className="text-sm text-atlas-muted">
            Free to start. No credit card required.
          </p>
        </div>
        <div className="rounded-xl border border-atlas-border bg-atlas-surface p-2">
          <SignUp
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
            signInUrl="/sign-in"
            forceRedirectUrl="/"
            fallbackRedirectUrl="/"
          />
        </div>
        <p className="mt-4 text-center text-xs text-atlas-muted">
          Already have an account?{" "}
          <a href="/sign-in" className="text-atlas-accent hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
