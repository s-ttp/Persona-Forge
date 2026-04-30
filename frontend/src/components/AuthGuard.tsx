"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [authState, setAuthState] = useState<"loading" | "ok" | "none">("loading");
  const [userInitial, setUserInitial] = useState("?");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        if (!cancelled) {
          setAuthState("none");
          if (pathname !== "/login") router.replace("/login");
        }
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;

        if (!res.ok) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setAuthState("none");
          if (pathname !== "/login") router.replace("/login");
        } else {
          setAuthState("ok");
          try {
            const u = JSON.parse(localStorage.getItem("user") ?? "{}");
            setUserInitial((u.email ?? "?")[0].toUpperCase());
          } catch { /* ignore */ }
          if (pathname === "/login") router.replace("/");
        }
      } catch {
        if (!cancelled) {
          setAuthState("none");
          if (pathname !== "/login") router.replace("/login");
        }
      }
    };

    check();
    return () => { cancelled = true; };
  }, [pathname, router]);

  // Login page: render immediately without nav (no flash, no spinner)
  if (pathname === "/login") {
    return (
      <div className="min-h-screen flex flex-col">
        {children}
      </div>
    );
  }

  // Protected pages: wait until auth is confirmed
  if (authState !== "ok") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Authenticated: render nav + content
  return (
    <>
      <nav className="fixed top-0 w-full z-50 p-4">
        <div className="max-w-7xl mx-auto glass rounded-2xl px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white text-xs tracking-tight shadow-lg shadow-indigo-500/30">PF</div>
            <span className="font-semibold text-xl text-white/90">PersonaForge</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/70 font-medium">
            <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
            <Link href="/projects/new" className="hover:text-white transition-colors">New Project</Link>
            <Link href="/personas" className="hover:text-white transition-colors">Personas</Link>
            <Link href="/monitor" className="hover:text-white transition-colors">Monitor</Link>
            <Link href="/analytics" className="hover:text-white transition-colors">Analytics</Link>
            <button
              onClick={() => {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                router.replace("/login");
              }}
              className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10 hover:bg-red-500/20 hover:border-red-500/30 transition-colors cursor-pointer"
              title="Sign out"
            >
              <span className="text-white/80 text-xs">{userInitial}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24 pb-12 px-4 max-w-7xl mx-auto w-full flex flex-col gap-8">
        {children}
      </main>
    </>
  );
}
