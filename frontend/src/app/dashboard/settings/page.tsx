"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";
import { Company, User } from "@/types";
import { Settings, Palette, Mail, HardDrive, Clock, Shield } from "lucide-react";
import GeneralTab from "./components/general-tab";
import AppearanceTab from "./components/appearance-tab";
import NotificationsTab from "./components/notifications-tab";
import BackupsTab from "./components/backups-tab";
import OperationsTab from "./components/operations-tab";
import ScreenAccessTab from "./components/screen-access-tab";

const isAdminPortal = process.env.NEXT_PUBLIC_ADMIN_PORTAL === "true";

type TabId = "general" | "operations" | "appearance" | "notifications" | "backups" | "screen-access";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "operations", label: "Operations", icon: Clock },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Mail },
  { id: "backups", label: "Backups", icon: HardDrive },
  ...(isAdminPortal
    ? [{ id: "screen-access" as const, label: "Screen Access", icon: Shield }]
    : []),
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [company, setCompany] = useState<Company | null>(null);
  const user = useDashboardUser();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Company>("/api/company")
      .then((res) => setCompany(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !company) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Loading...
      </div>
    );
  }

  // Filter tabs — Operations, Backups, Screen Access visible only to SUPER_ADMIN
  const visibleTabs = TABS.filter((tab) => {
    if (tab.id === "operations" || tab.id === "backups" || tab.id === "screen-access")
      return user?.role === "SUPER_ADMIN";
    return true;
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage company info, appearance, notifications, and backups
        </p>
      </div>

      <div className="flex gap-6 min-h-[600px]">
        {/* Left sidebar */}
        <nav className="w-48 shrink-0 space-y-1">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left ${
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {activeTab === "general" && (
            <GeneralTab company={company} setCompany={setCompany} />
          )}
          {activeTab === "operations" && (
            <OperationsTab
              timeLockEnabled={company.time_lock_enabled}
              onTimeLockChange={(enabled) =>
                setCompany({ ...company, time_lock_enabled: enabled })
              }
            />
          )}
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "backups" && <BackupsTab />}
          {activeTab === "screen-access" && <ScreenAccessTab />}
        </div>
      </div>
    </div>
  );
}
