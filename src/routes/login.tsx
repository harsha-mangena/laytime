import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LaytimeMark } from "@/components/mark";
import { Button } from "@/components/ui/button";

type LoginSearch = { redirect?: string };

function safeRedirect(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/api/")) return "/";
  return raw;
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): LoginSearch => {
    if (typeof s.redirect !== "string" || !s.redirect) return {};
    return { redirect: safeRedirect(s.redirect) };
  },
  component: Login,
});

function Login() {
  const search = Route.useSearch();
  const redirect = safeRedirect(search.redirect);
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="h-8 w-8 animate-pulse rounded-full bg-accent" />
      </main>
    );
  }
  if (user) return <Navigate to={redirect as "/"} />;

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/" className="flex items-center gap-2.5">
          <LaytimeMark className="size-6 text-steel" />
          <div>
            <div className="text-sm font-medium tracking-[0.18em] uppercase">Laytime</div>
            <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
              46 CFR 541
            </div>
          </div>
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-medium tracking-tight">Sign in</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Vendor keys are stored on your Laytime account, never in this browser. Sign in
            to connect a live TMS, carrier, or terminal endpoint.
          </p>
        </div>
        {authEnabled ? (
          <div className="flex flex-col gap-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: redirect })}
              >
                Continue with {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sign-in is disabled.</p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          The Northbridge sample book and public harbor feeds do not need an account. Live
          keys do.
        </p>
      </div>
    </main>
  );
}
