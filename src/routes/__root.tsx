import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Laytime";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id, email: u.email } : null;
});

/** Same public-host guard the injector uses for og:image — no Vercel system hosts, no IPs. */
function publicShareHost(): string {
  const published = String(import.meta.env.VITE_PUBLIC_HOSTNAME ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (!published || !/^[a-z0-9.-]+$/.test(published) || !published.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(published)) return "";
  if (
    published === "vercel.app" ||
    published.endsWith(".vercel.app") ||
    published === "vercel.com" ||
    published.endsWith(".vercel.com")
  ) {
    return "";
  }
  return published;
}

export const Route = createRootRoute({
  beforeLoad: async () => ({ sessionUser: await fetchSessionUser() }),
  head: () => {
    const host = publicShareHost();
    const xBanner = host ? `https://${host}/x-banner.jpg` : "";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: APP_NAME },
        { name: "theme-color", content: "#0b0c0e" },
        {
          name: "description",
          content:
            "OSRA 2022 demurrage and detention reconciliation. Flag non-compliant invoices and generate dispute packs inside the 30-day clock.",
        },
        ...(xBanner ? [{ property: "x:game:image", content: xBanner }] : []),
      ],
      links: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "stylesheet", href: appCss },
        { rel: "manifest", href: "/__grok/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
        },
      ],
    };
  },
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <Outlet />
            <Toaster
              theme="dark"
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "#1b1c20",
                  color: "#ecece8",
                  border: "1px solid #2a2b30",
                },
              }}
            />
          </TooltipProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
