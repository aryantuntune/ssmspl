"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, LogOut } from "lucide-react";
import { clearTokens } from "@/lib/auth";
import { User } from "@/types";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_CONFIG,
  isMenuGroup,
  type MenuEntry,
  type MenuGroup,
} from "./sidebar-menu-config";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

interface AppSidebarProps {
  user: User;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MANAGER: "Manager",
  BILLING_OPERATOR: "Billing Operator",
  TICKET_CHECKER: "Ticket Checker",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AppSidebar({
  user,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = new Set(user.menu_items);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Masters"]));

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleLogout = () => {
    clearTokens();
    router.push("/login");
  };

  const isItemAllowed = (entry: MenuEntry) => allowed.has(entry.label);
  const isGroupVisible = (group: MenuGroup) =>
    group.items.some((item) => allowed.has(item.label));

  const renderItem = (entry: MenuEntry, mobile = false) => {
    const active = pathname === entry.href;
    const Icon = entry.icon;

    if (!mobile && collapsed) {
      return (
        <Tooltip key={entry.href}>
          <TooltipTrigger asChild>
            <Link
              href={entry.href}
              className={cn(
                "flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors",
                active
                  ? "bg-sidebar-active text-sidebar-active-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-hover"
              )}
            >
              <Icon className="h-5 w-5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{entry.label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        key={entry.href}
        href={entry.href}
        onClick={mobile ? onMobileClose : undefined}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-active text-sidebar-active-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-hover"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{entry.label}</span>
      </Link>
    );
  };

  const renderGroup = (group: MenuGroup, mobile = false) => {
    if (!isGroupVisible(group)) return null;
    const expanded = expandedGroups.has(group.label);
    const visibleItems = group.items.filter(isItemAllowed);

    if (!mobile && collapsed) {
      return (
        <div key={group.label}>
          {visibleItems.map((item) => renderItem(item, false))}
        </div>
      );
    }

    return (
      <div key={group.label}>
        <button
          onClick={() => toggleGroup(group.label)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-hover transition-colors"
        >
          <span>{group.label}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              expanded ? "rotate-0" : "-rotate-90"
            )}
          />
        </button>
        {expanded && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
            {visibleItems.map((item) => renderItem(item, mobile))}
          </div>
        )}
      </div>
    );
  };

  const renderNav = (mobile = false) => (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
      {SIDEBAR_CONFIG.map((section, sIdx) => (
        <div key={sIdx}>
          {section.sectionLabel && (mobile || !collapsed) && (
            <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {section.sectionLabel}
            </p>
          )}
          {section.sectionLabel && !mobile && collapsed && (
            <Separator className="my-2 bg-sidebar-border" />
          )}
          {section.entries.map((entry) => {
            if (isMenuGroup(entry)) return renderGroup(entry, mobile);
            if (!isItemAllowed(entry)) return null;
            return renderItem(entry, mobile);
          })}
        </div>
      ))}
    </nav>
  );

  const renderUserCard = (mobile = false) => (
    <div className={cn("p-3", !mobile && collapsed ? "flex justify-center" : "")}>
      {!mobile && collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={handleLogout}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-sidebar-active text-sidebar-active-foreground text-xs">
                  {getInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {user.full_name} — {ROLE_LABELS[user.role] || user.role}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-sidebar-active text-sidebar-active-foreground text-xs font-semibold">
              {getInitials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-active-foreground truncate">
              {user.full_name}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {ROLE_LABELS[user.role] || user.role}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-hover transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={0}>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-screen sticky top-0 bg-sidebar border-r border-sidebar-border transition-all duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo + Collapse Toggle */}
        <div className={cn(
          "flex items-center h-14 px-3",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <Image
                src="/images/logos/logo-white.png"
                alt="SSMSPL"
                width={28}
                height={28}
                className="object-contain"
              />
              <span className="text-base font-bold text-sidebar-active-foreground">
                SSMSPL
              </span>
            </div>
          )}
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-hover transition-colors"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>

        <Separator className="bg-sidebar-border" />
        {renderNav(false)}
        <Separator className="bg-sidebar-border" />
        {renderUserCard(false)}
      </aside>

      {/* Mobile sidebar (Sheet overlay) */}
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose()}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center h-14 px-4">
              <div className="flex items-center gap-2">
                <Image
                  src="/images/logos/logo-white.png"
                  alt="SSMSPL"
                  width={28}
                  height={28}
                  className="object-contain"
                />
                <span className="text-base font-bold text-sidebar-active-foreground">
                  SSMSPL
                </span>
              </div>
            </div>

            <Separator className="bg-sidebar-border" />
            {renderNav(true)}
            <Separator className="bg-sidebar-border" />
            {renderUserCard(true)}
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
