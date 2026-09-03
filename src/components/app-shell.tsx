import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Cable,
  GanttChart,
  Inbox,
  LayoutDashboard,
  Menu,
  Plug,
  Scale,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LaytimeMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listConnections } from "@/lib/connectors/desk-fns";
import { asOfLabel } from "@/lib/format";
import { DESK } from "@/lib/seed";
import { useLaytime } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Command", icon: LayoutDashboard },
  { to: "/invoices", label: "Invoices", icon: Inbox },
  { to: "/gates", label: "Gates", icon: GanttChart },
  { to: "/disputes", label: "Disputes", icon: Scale },
  { to: "/connectors", label: "Connectors", icon: Plug },
  { to: "/ingest", label: "Ingest", icon: Upload },
  { to: "/api-docs", label: "API", icon: Cable },
  { to: "/rules", label: "Rulebook", icon: BookOpen },
] as const;

function NavLinks({ onNavigate, compact }: { onNavigate?: () => void; compact?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className={cn("flex flex-col gap-1", compact && "flex-row justify-around gap-0")}>
      {NAV.map((item) => {
        const active =
          item.to === "/"
            ? pathname === "/"
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
              compact ? "h-12 flex-col justify-center gap-1 px-2 text-[10px] tracking-wide" : "h-10",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className={cn(compact ? "size-4" : "size-4")} strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AuthSlot({ compact }: { compact?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (isPending) {
    return <div className="size-8 shrink-0 animate-pulse rounded-full bg-accent" />;
  }
  if (!user) {
    const redirect =
      pathname === "/login" || !pathname.startsWith("/") || pathname.startsWith("//")
        ? "/"
        : pathname;
    return (
      <Link
        to="/login"
        search={{ redirect }}
        className="text-xs tracking-wide text-muted-foreground hover:text-foreground"
      >
        Sign in
      </Link>
    );
  }
  return (
    <div className={cn("min-w-0", compact && "[&_span.text-sm]:hidden [&_button]:hidden")}>
      <UserButton />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user, isPending } = useCurrentUserState();
  useEffect(() => {
    void useLaytime.persist.rehydrate();
  }, []);
  useEffect(() => {
    if (isPending || !user) return;
    void listConnections()
      .then((rows) => useLaytime.getState().setConnections(rows))
      .catch(() => {
        /* signed-out or network — desk stays local */
      });
  }, [user, isPending]);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-background px-3 py-5 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2.5 px-2">
          <LaytimeMark className="size-6 text-steel" />
          <div>
            <div className="text-sm font-medium tracking-[0.18em] uppercase">Laytime</div>
            <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
              46 CFR 541
            </div>
          </div>
        </Link>
        <NavLinks />
        <div className="mt-auto flex flex-col gap-4 px-2 pt-6">
          <AuthSlot />
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            <div className="font-medium text-foreground/80">{DESK.org}</div>
            <div>{DESK.desk}</div>
            <div className="mt-2">As of {asOfLabel()}</div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm md:hidden">
        <Link to="/" className="flex items-center gap-2">
          <LaytimeMark className="size-5 text-steel" />
          <span className="text-sm font-medium tracking-[0.16em] uppercase">Laytime</span>
        </Link>
        <div className="flex items-center gap-2">
          <AuthSlot compact />
          <Button variant="ghost" size="icon" className="size-11" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-background">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 tracking-[0.16em] uppercase">
              <LaytimeMark className="size-5 text-steel" />
              Laytime
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <div className="mt-8 px-1">
            <AuthSlot />
          </div>
        </SheetContent>
      </Sheet>

      <main className="md:pl-56">
        <div className="mx-auto max-w-6xl px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-12">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-1 py-1 backdrop-blur-sm md:hidden">
        <div className="grid grid-cols-5">
          {NAV.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex h-14 flex-col items-center justify-center gap-1 text-[10px] tracking-wide text-muted-foreground"
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
