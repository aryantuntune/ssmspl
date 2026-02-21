"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { User } from "@/types";
import ThemeProvider from "@/components/ThemeProvider";
import AppSidebar from "@/components/dashboard/AppSidebar";
import AppHeader from "@/components/dashboard/AppHeader";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState("ocean");

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api.get("/api/auth/me").then((res) => {
      setUser(res.data);
    }).catch(() => {
      router.push("/login");
    });

    api.get("/api/company/").then((res) => {
      if (res.data.active_theme) {
        setActiveTheme(res.data.active_theme);
      }
    }).catch(() => {});
  }, [router]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <ThemeProvider initialThemeName={activeTheme}>
      <div className="min-h-screen flex bg-background text-foreground">
        <AppSidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <AppHeader
            user={user}
            onMobileMenuToggle={() => setMobileSidebarOpen(true)}
          />
          <main className="flex-1 p-4 lg:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
