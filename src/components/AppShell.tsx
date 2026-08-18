import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const NAV = [
  { to: "/feed", label: "Feed" },
  { to: "/reports", label: "My reports" },
  { to: "/moderation", label: "Moderation", staff: true },
  { to: "/lab", label: "Evaluation Lab", lab: true },
  { to: "/chat", label: "App DM Chat" },
  { to: "/admin", label: "Admin", admin: true },
  { to: "/audit", label: "Audit", staff: true },
  { to: "/privacy", label: "Privacy" },
  { to: "/safety", label: "Safety centre" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isStaff, isAdmin, signOut, roles, has } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            <span>SafeSpace</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.filter(
              (n) =>
                (!("staff" in n) || isStaff) &&
                (!("admin" in n) || isAdmin) &&
                (!("lab" in n) || isStaff || has("data_scientist")),
            ).map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    pathname === item.to && "bg-accent text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <NotificationBell />
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {user.email} · {roles.join(", ") || "user"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                  <LogOut className="size-4" /> Sign out
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-muted-foreground">
        AI output is a recommendation, never a final verdict. Every high-impact action is reviewed by
        a trained human moderator and recorded in the audit log.
      </footer>
    </div>
  );
}
