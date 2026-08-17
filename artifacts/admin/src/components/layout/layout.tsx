import { Link, useLocation } from "wouter";
import { Users, LayoutDashboard, LogOut } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const { logout, admin } = useAuth();

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/users", label: "Users", icon: Users },
  ];

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="p-6 flex items-center gap-2 font-serif text-2xl italic tracking-wide text-sidebar-primary">
        <div className="h-6 w-6 rounded-full bg-sidebar-primary opacity-80" />
        companion
      </div>

      <nav className="flex-1 space-y-1 px-4 py-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="block">
            <div
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                location.startsWith(link.href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </div>
          </Link>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col truncate">
            <span className="text-sm font-medium truncate">{admin?.displayName || "Admin"}</span>
            <span className="text-xs text-sidebar-foreground/60 truncate">{admin?.email}</span>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { admin, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Redirect to login when auth check completes and user is not authenticated
  useEffect(() => {
    if (!isLoading && !admin && location !== "/login") {
      setLocation("/login");
    }
  }, [isLoading, admin, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/20" />
          <p className="text-sm text-muted-foreground tracking-widest uppercase">Loading...</p>
        </div>
      </div>
    );
  }

  if (!admin && location !== "/login") {
    // Redirect is in-flight — render nothing while wouter processes it
    return null;
  }

  if (location === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
