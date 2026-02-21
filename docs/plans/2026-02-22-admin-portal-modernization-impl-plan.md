# Admin Portal Modernization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modernize the SSMSPL admin portal with shadcn/ui, collapsible sidebar, multi-theme system, and missing features (enhanced dashboard, reports, employee transfer, ticket verification).

**Architecture:** Shell-first incremental approach. Phase 1 builds the foundation (shadcn/ui, layout shell, theme system). Phase 2 migrates existing pages. Phase 3 adds new features. Phase 4 polishes.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, lucide-react, Axios, FastAPI backend.

---

## Phase 1: Foundation (Shell + Theme)

### Task 1: Install and Configure shadcn/ui

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/components.json`
- Create: `frontend/src/lib/utils.ts`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tsconfig.json`

**Step 1: Install shadcn/ui dependencies**

```bash
cd frontend
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes
- CSS file: src/app/globals.css
- Tailwind CSS config: (skip/auto-detect for v4)
- Components alias: @/components/ui
- Utils alias: @/lib/utils

This creates `components.json` and `src/lib/utils.ts` (with `cn()` utility).

**Step 2: Install core shadcn components**

```bash
cd frontend
npx shadcn@latest add button card input label select dialog table badge dropdown-menu separator sheet tooltip tabs avatar command switch scroll-area
```

**Step 3: Verify installation**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: install shadcn/ui with core components"
```

---

### Task 2: Create Theme Configuration

**Files:**
- Create: `frontend/src/lib/themes.ts`

**Step 1: Create theme definitions file**

```typescript
// frontend/src/lib/themes.ts

export interface ThemeColors {
  sidebar: string;
  sidebarForeground: string;
  sidebarHover: string;
  sidebarActive: string;
  sidebarActiveForeground: string;
  sidebarBorder: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

export interface ThemeDefinition {
  name: string;
  label: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const DEFAULT_THEMES: ThemeDefinition[] = [
  {
    name: "ocean",
    label: "Ocean",
    light: {
      sidebar: "220 65% 9%",       // #0f172a (slate-900)
      sidebarForeground: "210 40% 80%",
      sidebarHover: "217 33% 17%", // slate-800
      sidebarActive: "213 94% 52%", // blue-500
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "217 33% 17%",
      background: "210 40% 98%",    // slate-50
      foreground: "222 47% 11%",    // slate-900
      card: "0 0% 100%",
      cardForeground: "222 47% 11%",
      primary: "221 83% 53%",       // blue-600
      primaryForeground: "0 0% 100%",
      secondary: "210 40% 96%",
      secondaryForeground: "222 47% 11%",
      muted: "210 40% 96%",
      mutedForeground: "215 16% 47%",
      accent: "210 40% 96%",
      accentForeground: "222 47% 11%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "214 32% 91%",
      input: "214 32% 91%",
      ring: "221 83% 53%",
    },
    dark: {
      sidebar: "222 47% 6%",
      sidebarForeground: "210 40% 80%",
      sidebarHover: "217 33% 12%",
      sidebarActive: "213 94% 52%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "217 33% 17%",
      background: "222 47% 8%",
      foreground: "210 40% 98%",
      card: "222 47% 11%",
      cardForeground: "210 40% 98%",
      primary: "217 91% 60%",
      primaryForeground: "0 0% 100%",
      secondary: "217 33% 17%",
      secondaryForeground: "210 40% 98%",
      muted: "217 33% 17%",
      mutedForeground: "215 20% 65%",
      accent: "217 33% 17%",
      accentForeground: "210 40% 98%",
      destructive: "0 63% 31%",
      destructiveForeground: "0 0% 100%",
      border: "217 33% 17%",
      input: "217 33% 17%",
      ring: "224 76% 48%",
    },
  },
  {
    name: "indigo",
    label: "Indigo",
    light: {
      sidebar: "263 70% 11%",       // deep indigo (#1e1b4b)
      sidebarForeground: "226 64% 80%",
      sidebarHover: "260 43% 18%",
      sidebarActive: "239 84% 67%", // indigo-500
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "260 43% 18%",
      background: "240 20% 98%",
      foreground: "263 70% 11%",
      card: "0 0% 100%",
      cardForeground: "263 70% 11%",
      primary: "239 84% 67%",       // indigo-500
      primaryForeground: "0 0% 100%",
      secondary: "240 5% 96%",
      secondaryForeground: "263 70% 11%",
      muted: "240 5% 96%",
      mutedForeground: "240 4% 46%",
      accent: "240 5% 96%",
      accentForeground: "263 70% 11%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "240 6% 90%",
      input: "240 6% 90%",
      ring: "239 84% 67%",
    },
    dark: {
      sidebar: "263 70% 6%",
      sidebarForeground: "226 64% 80%",
      sidebarHover: "260 43% 12%",
      sidebarActive: "239 84% 67%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "260 43% 18%",
      background: "263 50% 8%",
      foreground: "240 20% 98%",
      card: "263 50% 11%",
      cardForeground: "240 20% 98%",
      primary: "239 84% 67%",
      primaryForeground: "0 0% 100%",
      secondary: "260 43% 18%",
      secondaryForeground: "240 20% 98%",
      muted: "260 43% 18%",
      mutedForeground: "240 5% 65%",
      accent: "260 43% 18%",
      accentForeground: "240 20% 98%",
      destructive: "0 63% 31%",
      destructiveForeground: "0 0% 100%",
      border: "260 43% 18%",
      input: "260 43% 18%",
      ring: "239 84% 67%",
    },
  },
  {
    name: "emerald",
    label: "Emerald",
    light: {
      sidebar: "166 72% 6%",        // dark teal
      sidebarForeground: "163 33% 75%",
      sidebarHover: "164 50% 12%",
      sidebarActive: "160 84% 39%", // emerald-600
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "164 50% 12%",
      background: "160 20% 98%",
      foreground: "166 72% 6%",
      card: "0 0% 100%",
      cardForeground: "166 72% 6%",
      primary: "160 84% 39%",
      primaryForeground: "0 0% 100%",
      secondary: "160 10% 96%",
      secondaryForeground: "166 72% 6%",
      muted: "160 10% 96%",
      mutedForeground: "163 10% 46%",
      accent: "160 10% 96%",
      accentForeground: "166 72% 6%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "160 10% 90%",
      input: "160 10% 90%",
      ring: "160 84% 39%",
    },
    dark: {
      sidebar: "166 72% 4%",
      sidebarForeground: "163 33% 75%",
      sidebarHover: "164 50% 10%",
      sidebarActive: "160 84% 39%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "164 50% 12%",
      background: "166 50% 6%",
      foreground: "160 20% 98%",
      card: "166 50% 9%",
      cardForeground: "160 20% 98%",
      primary: "160 84% 39%",
      primaryForeground: "0 0% 100%",
      secondary: "164 50% 12%",
      secondaryForeground: "160 20% 98%",
      muted: "164 50% 12%",
      mutedForeground: "163 10% 65%",
      accent: "164 50% 12%",
      accentForeground: "160 20% 98%",
      destructive: "0 63% 31%",
      destructiveForeground: "0 0% 100%",
      border: "164 50% 12%",
      input: "164 50% 12%",
      ring: "160 84% 39%",
    },
  },
  {
    name: "slate",
    label: "Slate",
    light: {
      sidebar: "215 25% 14%",       // slate-850
      sidebarForeground: "215 20% 75%",
      sidebarHover: "215 19% 20%",
      sidebarActive: "215 16% 47%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "215 19% 20%",
      background: "210 20% 98%",
      foreground: "215 25% 14%",
      card: "0 0% 100%",
      cardForeground: "215 25% 14%",
      primary: "215 16% 47%",
      primaryForeground: "0 0% 100%",
      secondary: "210 20% 96%",
      secondaryForeground: "215 25% 14%",
      muted: "210 20% 96%",
      mutedForeground: "215 16% 47%",
      accent: "210 20% 96%",
      accentForeground: "215 25% 14%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "214 20% 90%",
      input: "214 20% 90%",
      ring: "215 16% 47%",
    },
    dark: {
      sidebar: "215 25% 8%",
      sidebarForeground: "215 20% 75%",
      sidebarHover: "215 19% 14%",
      sidebarActive: "215 20% 65%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "215 19% 20%",
      background: "215 25% 9%",
      foreground: "210 20% 98%",
      card: "215 25% 12%",
      cardForeground: "210 20% 98%",
      primary: "215 20% 65%",
      primaryForeground: "0 0% 100%",
      secondary: "215 19% 20%",
      secondaryForeground: "210 20% 98%",
      muted: "215 19% 20%",
      mutedForeground: "215 20% 65%",
      accent: "215 19% 20%",
      accentForeground: "210 20% 98%",
      destructive: "0 63% 31%",
      destructiveForeground: "0 0% 100%",
      border: "215 19% 20%",
      input: "215 19% 20%",
      ring: "215 20% 65%",
    },
  },
];

export function getThemeByName(name: string): ThemeDefinition | undefined {
  return DEFAULT_THEMES.find((t) => t.name === name);
}

export function applyTheme(theme: ThemeDefinition, mode: "light" | "dark") {
  const colors = mode === "dark" ? theme.dark : theme.light;
  const root = document.documentElement;

  // Apply sidebar colors
  root.style.setProperty("--sidebar", colors.sidebar);
  root.style.setProperty("--sidebar-foreground", colors.sidebarForeground);
  root.style.setProperty("--sidebar-hover", colors.sidebarHover);
  root.style.setProperty("--sidebar-active", colors.sidebarActive);
  root.style.setProperty("--sidebar-active-foreground", colors.sidebarActiveForeground);
  root.style.setProperty("--sidebar-border", colors.sidebarBorder);

  // Apply global colors
  root.style.setProperty("--background", colors.background);
  root.style.setProperty("--foreground", colors.foreground);
  root.style.setProperty("--card", colors.card);
  root.style.setProperty("--card-foreground", colors.cardForeground);
  root.style.setProperty("--primary", colors.primary);
  root.style.setProperty("--primary-foreground", colors.primaryForeground);
  root.style.setProperty("--secondary", colors.secondary);
  root.style.setProperty("--secondary-foreground", colors.secondaryForeground);
  root.style.setProperty("--muted", colors.muted);
  root.style.setProperty("--muted-foreground", colors.mutedForeground);
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--accent-foreground", colors.accentForeground);
  root.style.setProperty("--destructive", colors.destructive);
  root.style.setProperty("--destructive-foreground", colors.destructiveForeground);
  root.style.setProperty("--border", colors.border);
  root.style.setProperty("--input", colors.input);
  root.style.setProperty("--ring", colors.ring);

  // Toggle dark class
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/themes.ts
git commit -m "feat: add theme configuration with 4 color palettes"
```

---

### Task 3: Create ThemeProvider Context

**Files:**
- Create: `frontend/src/components/ThemeProvider.tsx`

**Step 1: Create the provider**

```typescript
// frontend/src/components/ThemeProvider.tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { ThemeDefinition, DEFAULT_THEMES, getThemeByName, applyTheme } from "@/lib/themes";

type Mode = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeDefinition;
  mode: Mode;
  setThemeName: (name: string) => void;
  toggleMode: () => void;
  availableThemes: ThemeDefinition[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  initialThemeName?: string;
}

export default function ThemeProvider({ children, initialThemeName = "ocean" }: ThemeProviderProps) {
  const [themeName, setThemeNameState] = useState(initialThemeName);
  const [mode, setMode] = useState<Mode>("light");

  const theme = getThemeByName(themeName) || DEFAULT_THEMES[0];

  useEffect(() => {
    applyTheme(theme, mode);
  }, [theme, mode]);

  const setThemeName = useCallback((name: string) => {
    setThemeNameState(name);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, mode, setThemeName, toggleMode, availableThemes: DEFAULT_THEMES }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ThemeProvider.tsx
git commit -m "feat: add ThemeProvider context for theme management"
```

---

### Task 4: Add active_theme to Company Settings (Backend)

**Files:**
- Modify: `backend/app/models/company.py` — add `active_theme` column
- Modify: `backend/app/schemas/company.py` — add field to CompanyUpdate and CompanyRead
- Modify: `backend/scripts/ddl.sql` — add column to DDL

**Step 1: Update Company model**

In `backend/app/models/company.py`, add after `sf_item_id`:

```python
active_theme: Mapped[str | None] = mapped_column(String(50), nullable=True, default="ocean")
```

**Step 2: Update Company schemas**

In `backend/app/schemas/company.py`, add to `CompanyUpdate`:

```python
active_theme: str | None = Field(None, description="Active UI theme name")
```

Add to `CompanyRead`:

```python
active_theme: str | None = Field(None, description="Active UI theme name")
```

**Step 3: Update DDL**

In `backend/scripts/ddl.sql`, add column to company table:

```sql
active_theme       VARCHAR(50) DEFAULT 'ocean',
```

**Step 4: Run SQL to add column to existing database**

```bash
cd backend
# Connect to PostgreSQL and add column:
# ALTER TABLE company ADD COLUMN IF NOT EXISTS active_theme VARCHAR(50) DEFAULT 'ocean';
# UPDATE company SET active_theme = 'ocean' WHERE active_theme IS NULL;
```

**Step 5: Verify backend starts**

```bash
cd backend && uvicorn app.main:app --reload
```

**Step 6: Commit**

```bash
git add backend/app/models/company.py backend/app/schemas/company.py backend/scripts/ddl.sql
git commit -m "feat: add active_theme field to company settings"
```

---

### Task 5: Update RBAC Menu Items for New Features

**Files:**
- Modify: `backend/app/core/rbac.py`

**Step 1: Add new menu items to roles**

Add "Ticket Verification" to MANAGER, BILLING_OPERATOR roles.
Add "Reports" already exists for relevant roles.
Add "Employee Transfer" to SUPER_ADMIN, ADMIN, MANAGER roles.

Update `ROLE_MENU_ITEMS` in `backend/app/core/rbac.py`:

```python
ROLE_MENU_ITEMS: dict[UserRole, list[str]] = {
    UserRole.SUPER_ADMIN: [
        "Dashboard", "Users", "Ferries", "Branches", "Routes", "Schedules",
        "Items", "Item Rates", "Payment Modes", "Ticketing", "Multi-Ticketing",
        "Reports", "Employee Transfer", "Ticket Verification", "System Settings",
    ],
    UserRole.ADMIN: [
        "Dashboard", "Users", "Ferries", "Branches", "Routes", "Schedules",
        "Items", "Item Rates", "Payment Modes", "Ticketing", "Multi-Ticketing",
        "Reports", "Employee Transfer", "Ticket Verification", "System Settings",
    ],
    UserRole.MANAGER: [
        "Dashboard", "Ferries", "Branches", "Routes", "Schedules", "Items",
        "Item Rates", "Payment Modes", "Ticketing", "Multi-Ticketing",
        "Reports", "Employee Transfer", "Ticket Verification",
    ],
    UserRole.BILLING_OPERATOR: [
        "Dashboard", "Ticketing", "Multi-Ticketing",
    ],
    UserRole.TICKET_CHECKER: [
        "Dashboard", "Ticket Verification",
    ],
}
```

**Step 2: Commit**

```bash
git add backend/app/core/rbac.py
git commit -m "feat: add Employee Transfer and Ticket Verification to RBAC menu items"
```

---

### Task 6: Create New Dashboard Layout

**Files:**
- Create: `frontend/src/app/dashboard/layout.tsx`
- Create: `frontend/src/components/dashboard/DashboardShell.tsx`

This is the key architectural change — a shared dashboard layout that all admin pages use, removing the duplicated Navbar+Sidebar from every page.

**Step 1: Create DashboardShell**

```typescript
// frontend/src/components/dashboard/DashboardShell.tsx
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

    // Fetch company settings for active theme
    api.get("/api/company/").then((res) => {
      if (res.data.active_theme) {
        setActiveTheme(res.data.active_theme);
      }
    }).catch(() => {
      // Non-admin roles may not have access — use default
    });
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
        />
        <div className="flex-1 flex flex-col min-h-screen">
          <AppHeader user={user} />
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
```

**Step 2: Create dashboard layout.tsx**

```typescript
// frontend/src/app/dashboard/layout.tsx
import DashboardShell from "@/components/dashboard/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
```

**Step 3: Commit**

```bash
git add frontend/src/app/dashboard/layout.tsx frontend/src/components/dashboard/DashboardShell.tsx
git commit -m "feat: add shared dashboard layout with auth, theme, and shell"
```

---

### Task 7: Create New Collapsible Sidebar

**Files:**
- Create: `frontend/src/components/dashboard/AppSidebar.tsx`
- Create: `frontend/src/components/dashboard/sidebar-menu-config.ts`

**Step 1: Create sidebar menu configuration**

This maps the backend RBAC menu item strings to grouped sidebar entries with icons and routes.

```typescript
// frontend/src/components/dashboard/sidebar-menu-config.ts
import {
  LayoutDashboard, Ticket, TicketCheck, FileText, BarChart3,
  Ship, MapPin, Route as RouteIcon, Clock, Package, DollarSign,
  CreditCard, Users, ArrowLeftRight, Settings, Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface MenuEntry {
  label: string;       // must match RBAC menu item string
  icon: LucideIcon;
  href: string;
}

export interface MenuGroup {
  label: string;
  items: MenuEntry[];
}

export interface SidebarSection {
  sectionLabel?: string; // e.g. "ADMINISTRATION"
  entries: (MenuEntry | MenuGroup)[];
}

// The full sidebar structure. Items not in user's menu_items will be filtered out.
export const SIDEBAR_CONFIG: SidebarSection[] = [
  {
    entries: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { label: "Ticketing", icon: Ticket, href: "/dashboard/ticketing" },
      { label: "Multi-Ticketing", icon: TicketCheck, href: "/dashboard/multiticketing" },
    ],
  },
  {
    entries: [
      {
        label: "Reports",
        items: [
          { label: "Reports", icon: BarChart3, href: "/dashboard/reports" },
        ],
      },
    ],
  },
  {
    entries: [
      {
        label: "Masters",
        items: [
          { label: "Items", icon: Package, href: "/dashboard/items" },
          { label: "Item Rates", icon: DollarSign, href: "/dashboard/item-rates" },
          { label: "Ferries", icon: Ship, href: "/dashboard/ferries" },
          { label: "Branches", icon: MapPin, href: "/dashboard/branches" },
          { label: "Routes", icon: RouteIcon, href: "/dashboard/routes" },
          { label: "Schedules", icon: Clock, href: "/dashboard/schedules" },
          { label: "Payment Modes", icon: CreditCard, href: "/dashboard/payment-modes" },
        ],
      },
    ],
  },
  {
    entries: [
      { label: "Employee Transfer", icon: ArrowLeftRight, href: "/dashboard/transfer" },
      { label: "Ticket Verification", icon: Shield, href: "/dashboard/verify" },
    ],
  },
  {
    sectionLabel: "ADMINISTRATION",
    entries: [
      {
        label: "User Management",
        items: [
          { label: "Users", icon: Users, href: "/dashboard/users" },
        ],
      },
      { label: "System Settings", icon: Settings, href: "/dashboard/settings" },
    ],
  },
];

export function isMenuGroup(entry: MenuEntry | MenuGroup): entry is MenuGroup {
  return "items" in entry;
}
```

**Step 2: Create AppSidebar component**

```typescript
// frontend/src/components/dashboard/AppSidebar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, LogOut } from "lucide-react";
import { clearTokens } from "@/lib/auth";
import { useRouter } from "next/navigation";
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

interface AppSidebarProps {
  user: User;
  collapsed: boolean;
  onToggle: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  billing_operator: "Billing Operator",
  ticket_checker: "Ticket Checker",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AppSidebar({ user, collapsed, onToggle }: AppSidebarProps) {
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

  // Filter: only show items that appear in user.menu_items
  const isItemAllowed = (entry: MenuEntry) => allowed.has(entry.label);
  const isGroupVisible = (group: MenuGroup) =>
    group.items.some((item) => allowed.has(item.label));

  const renderItem = (entry: MenuEntry) => {
    const active = pathname === entry.href;
    const Icon = entry.icon;

    if (collapsed) {
      return (
        <Tooltip key={entry.href}>
          <TooltipTrigger asChild>
            <Link
              href={entry.href}
              className={cn(
                "flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors",
                active
                  ? "bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))]"
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
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]"
            : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))]"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{entry.label}</span>
      </Link>
    );
  };

  const renderGroup = (group: MenuGroup) => {
    if (!isGroupVisible(group)) return null;
    const expanded = expandedGroups.has(group.label);
    const visibleItems = group.items.filter(isItemAllowed);

    if (collapsed) {
      return (
        <div key={group.label}>
          {visibleItems.map(renderItem)}
        </div>
      );
    }

    return (
      <div key={group.label}>
        <button
          onClick={() => toggleGroup(group.label)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))] transition-colors"
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
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[hsl(var(--sidebar-border))] pl-2">
            {visibleItems.map(renderItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen sticky top-0 bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] transition-all duration-200",
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
              <span className="text-base font-bold text-[hsl(var(--sidebar-active-foreground))]">
                SSMSPL
              </span>
            </div>
          )}
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))] transition-colors"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>

        <Separator className="bg-[hsl(var(--sidebar-border))]" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {SIDEBAR_CONFIG.map((section, sIdx) => (
            <div key={sIdx}>
              {section.sectionLabel && !collapsed && (
                <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-foreground))]/50">
                  {section.sectionLabel}
                </p>
              )}
              {section.sectionLabel && collapsed && (
                <Separator className="my-2 bg-[hsl(var(--sidebar-border))]" />
              )}
              {section.entries.map((entry) => {
                if (isMenuGroup(entry)) return renderGroup(entry);
                if (!isItemAllowed(entry)) return null;
                return renderItem(entry);
              })}
            </div>
          ))}
        </nav>

        <Separator className="bg-[hsl(var(--sidebar-border))]" />

        {/* User Card */}
        <div className={cn("p-3", collapsed ? "flex justify-center" : "")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleLogout}>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))] text-xs">
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
                <AvatarFallback className="bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))] text-xs font-semibold">
                  {getInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[hsl(var(--sidebar-active-foreground))] truncate">
                  {user.full_name}
                </p>
                <p className="text-xs text-[hsl(var(--sidebar-foreground))]/60 truncate">
                  {ROLE_LABELS[user.role] || user.role}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))] transition-colors"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/dashboard/
git commit -m "feat: add collapsible sidebar with grouped navigation and icons"
```

---

### Task 8: Create New Header Component

**Files:**
- Create: `frontend/src/components/dashboard/AppHeader.tsx`

**Step 1: Create the header**

```typescript
// frontend/src/components/dashboard/AppHeader.tsx
"use client";

import { Bell, Moon, Sun, Search } from "lucide-react";
import { User } from "@/types";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AppHeaderProps {
  user: User;
}

export default function AppHeader({ user: _user }: AppHeaderProps) {
  const { mode, toggleMode } = useTheme();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-9 w-64 h-9 bg-muted/50"
          />
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleMode}>
          {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/dashboard/AppHeader.tsx
git commit -m "feat: add minimal dashboard header with search, theme toggle, and notifications"
```

---

### Task 9: Create Reusable DataTable Component

**Files:**
- Create: `frontend/src/components/dashboard/DataTable.tsx`

This wraps the shadcn table with built-in sorting, pagination, and empty states — replacing the hand-rolled table pattern used on every CRUD page.

**Step 1: Create the DataTable**

```typescript
// frontend/src/components/dashboard/DataTable.tsx
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSort?: (column: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  totalCount,
  page,
  pageSize,
  sortBy,
  sortOrder,
  onPageChange,
  onPageSizeChange,
  onSort,
  loading = false,
  emptyMessage = "No records found.",
  emptyIcon,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn("font-semibold", col.className, col.sortable && "cursor-pointer select-none")}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      sortBy === col.key ? (
                        sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {emptyIcon}
                    <p>{emptyMessage}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => (
                <TableRow key={idx} className="hover:bg-muted/30">
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render ? col.render(row) : (row[col.key] as React.ReactNode) ?? "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((s) => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>
            {totalCount > 0 ? `${start}–${end} of ${totalCount}` : "0 records"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPageChange(1)}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-3 text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/dashboard/DataTable.tsx
git commit -m "feat: add reusable DataTable component with sorting and pagination"
```

---

### Task 10: Remove Navbar/Sidebar from Existing Pages + Verify Shell

**Files:**
- Modify: Every `frontend/src/app/dashboard/*/page.tsx`

Since the new `dashboard/layout.tsx` handles Navbar and Sidebar, every existing page needs its wrapper removed. Each page currently has this pattern:

```typescript
// OLD pattern in every page:
return (
  <div className="min-h-screen flex flex-col bg-gray-50">
    <Navbar user={currentUser} />
    <div className="flex flex-1">
      <Sidebar menuItems={currentUser.menu_items} />
      <main className="flex-1 p-8">
        {/* actual content */}
      </main>
    </div>
  </div>
);
```

Replace with just the inner content (the `<main>` content only), since the layout wraps it. Also remove the `useEffect` auth check and `/api/auth/me` fetch from each page since DashboardShell does it.

**Step 1: Update each page**

For every page in `frontend/src/app/dashboard/*/page.tsx`:
1. Remove Navbar and Sidebar imports
2. Remove the `isAuthenticated()` check and `/api/auth/me` API call
3. Remove the `currentUser` state and loading spinner wrapper
4. Return only the page content (what was inside `<main>`)
5. Keep page-specific data fetching (e.g. users list, branches list, etc.)
6. Keep all existing functionality intact

**Important:** Start with a simple page first (e.g. `change-password/page.tsx`) to verify the shell works, then batch-update all other pages.

**Step 2: Verify the shell works**

```bash
cd frontend && npm run dev
# Navigate to http://localhost:3000/dashboard
# Verify: new sidebar appears, pages render correctly, auth works
```

**Step 3: Verify build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add frontend/src/app/dashboard/ frontend/src/components/
git commit -m "refactor: migrate all dashboard pages to shared layout shell"
```

---

## Phase 2: Migrate Existing Pages to shadcn/ui

### Task 11: Migrate Dashboard Home (Enhanced Version)

**Files:**
- Rewrite: `frontend/src/app/dashboard/page.tsx`

Replace the simple welcome + menu grid with an enhanced dashboard matching the Jetty design:
- Welcome banner with gradient background (themed)
- 4 stats cards: Tickets Issued, Revenue, Active Ferries, Pending Verifications
- Quick Actions grid (New Ticket, View Reports, Verify Tickets)
- Recent Tickets list

Stats data should be fetched from existing API endpoints:
- `GET /api/tickets/?limit=5` for recent tickets
- `GET /api/boats/?status=active` count for active ferries
- Revenue and ticket counts can be derived from tickets list

Use shadcn Card, Badge, Button components throughout.

**Commit:** `feat: enhance dashboard with stats cards, quick actions, and recent tickets`

---

### Task 12–18: Migrate All CRUD Pages

Each CRUD page follows the same migration pattern. Do them one at a time.

**Pages to migrate (in order):**
- Task 12: `users/page.tsx`
- Task 13: `ferries/page.tsx`
- Task 14: `branches/page.tsx` (preserve PDF/Excel export)
- Task 15: `routes/page.tsx`
- Task 16: `schedules/page.tsx`
- Task 17: `items/page.tsx`
- Task 18: `item-rates/page.tsx`
- Task 19: `payment-modes/page.tsx`

**Migration pattern for each page:**

1. **Replace layout wrapper** — remove Navbar/Sidebar (already done in Task 10)
2. **Replace page header** — use shadcn Card for the page header section:
   ```tsx
   <div className="flex items-center justify-between mb-6">
     <div>
       <h1 className="text-2xl font-bold">{pageTitle}</h1>
       <p className="text-muted-foreground">{pageSubtitle}</p>
     </div>
     <Button onClick={() => setShowCreateModal(true)}>
       <Plus className="h-4 w-4 mr-2" /> Add {entityName}
     </Button>
   </div>
   ```
3. **Replace filters** — use shadcn Card, Input, Select for the filter bar
4. **Replace table** — use the DataTable component from Task 9
5. **Replace modals** — use shadcn Dialog, Label, Input, Select, Switch
6. **Replace status badges** — use shadcn Badge with `variant="default"` (active) or `variant="destructive"` (inactive)
7. **Keep all existing API calls, state, and logic** — only change the UI layer
8. **Add avatar circles** — for entities with names (users, branches), show initial circle using shadcn Avatar

**Commit each page separately:** `refactor: migrate {page} to shadcn/ui components`

---

### Task 20: Migrate Ticketing Page

**Files:**
- Modify: `frontend/src/app/dashboard/ticketing/page.tsx`

This is the most complex page (2408 lines). Migration approach:
1. Replace wrapper and header with shadcn components
2. Replace Trip Information section with shadcn Card + Select + Input
3. Keep line items table (custom) but restyle with shadcn Table classes
4. Replace payment modal with shadcn Dialog
5. Replace all buttons with shadcn Button
6. Keep all business logic, calculations, and API calls intact

**Commit:** `refactor: migrate ticketing page to shadcn/ui`

---

### Task 21: Migrate Multi-Ticketing Page

**Files:**
- Modify: `frontend/src/app/dashboard/multiticketing/page.tsx`

Same approach as ticketing — replace UI layer, keep logic.

**Commit:** `refactor: migrate multi-ticketing page to shadcn/ui`

---

### Task 22: Migrate Settings Page (Enhanced with Theme Management)

**Files:**
- Modify: `frontend/src/app/dashboard/settings/page.tsx`

Enhance the existing settings page to include:
1. **Company Information card** (existing functionality, restyled with shadcn)
2. **Theme Management card** (new):
   - Active theme selector (shadcn Select dropdown)
   - Light/dark mode toggle (shadcn Switch)
   - Theme preview strip showing the color palette
   - Only visible to Admin and Super Admin roles
   - Saves to `PATCH /api/company/` with `active_theme` field

**Commit:** `feat: enhance settings page with theme management`

---

### Task 23: Migrate Change Password Page

**Files:**
- Modify: `frontend/src/app/dashboard/change-password/page.tsx`

Simple migration — wrap in shadcn Card, use shadcn Input and Button.

**Commit:** `refactor: migrate change-password page to shadcn/ui`

---

## Phase 3: Add New Features

### Task 24: Employee Transfer Page

**Backend files:**
- Modify: `backend/app/routers/users.py` — add `PATCH /api/users/{id}/transfer` endpoint
- Modify: `backend/app/services/user_service.py` — add transfer logic

**Frontend files:**
- Create: `frontend/src/app/dashboard/transfer/page.tsx`

**Step 1: Add backend transfer endpoint**

In `backend/app/routers/users.py`, add:

```python
@router.patch(
    "/{user_id}/transfer",
    response_model=UserRead,
    summary="Transfer employee to a different route",
)
async def transfer_employee(
    user_id: uuid.UUID,
    body: dict,  # {"route_id": int}
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)),
):
    return await user_service.transfer_user(db, user_id, body["route_id"])
```

In `backend/app/services/user_service.py`, add:

```python
async def transfer_user(db: AsyncSession, user_id: uuid.UUID, route_id: int) -> User:
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.route_id = route_id
    await db.commit()
    await db.refresh(user)
    return user
```

**Step 2: Create frontend transfer page**

Build a page showing all employees with their current branch/route assignment and a "Transfer" button that opens a Dialog to select a new route.

Uses:
- `GET /api/users/?limit=200` for employee list
- `GET /api/routes/?limit=200&status=active` for route dropdown
- `PATCH /api/users/{id}/transfer` for the transfer action
- shadcn DataTable, Dialog, Select, Button components

**Commit:** `feat: add employee transfer page with backend endpoint`

---

### Task 25: Ticket Verification Page

**Files:**
- Create/Rewrite: `frontend/src/app/dashboard/verify/page.tsx`

Build a ticket verification page matching the Jetty design:
1. **Search section** — centered Card with ticket ID input + Search button
2. **Ticket details section** (appears after search):
   - Verification status badge (green=verified, amber=pending)
   - Info grid: Branch, Date, Ferry/Schedule, Total Amount
   - Line items table showing ticket breakdown
   - Action buttons: Mark as Verified, Print 58mm, Print 80mm

Uses existing APIs:
- `GET /api/tickets/{id}` — fetch ticket details
- `PATCH /api/tickets/{id}` — update verification status (if endpoint exists, or add it)

**Commit:** `feat: add ticket verification page with search and verify actions`

---

### Task 26: Reports Page

**Frontend files:**
- Create: `frontend/src/app/dashboard/reports/page.tsx`

**Backend files (if needed):**
- May need `GET /api/tickets/` with additional query params for date range filtering

Build a reports page matching the Jetty design:
1. **Filter panel** — Card with: Branch dropdown, Payment Mode dropdown, Date From, Date To, Filter + Reset buttons
2. **Stats summary** — 4 gradient-colored Card components: Total Tickets, Total Revenue, Avg Ticket Value, Cash Payments
3. **Ticket details table** — DataTable with: Date, Ticket #, Branch, Ferry, Customer, Amount, Status
4. **CSV export button** — generates CSV from filtered data
5. **Page total footer** — sum of amounts on current page

Uses existing APIs:
- `GET /api/tickets/?branch_id=X&payment_mode=Y&from_date=Z&to_date=W`
- `GET /api/branches/?limit=200` for branch filter dropdown
- `GET /api/payment-modes/?limit=200` for payment mode filter

**Commit:** `feat: add reports page with filters, stats, and CSV export`

---

## Phase 4: Polish

### Task 27: Update Sidebar Routes Map

**Files:**
- Modify: `frontend/src/components/dashboard/sidebar-menu-config.ts`

Ensure all new routes are mapped:
- `/dashboard/transfer` for Employee Transfer
- `/dashboard/verify` for Ticket Verification
- `/dashboard/reports` for Reports

**Commit:** `fix: ensure all new page routes are mapped in sidebar config`

---

### Task 28: Mobile Responsive Sidebar

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardShell.tsx`
- Modify: `frontend/src/components/dashboard/AppSidebar.tsx`
- Modify: `frontend/src/components/dashboard/AppHeader.tsx`

Add mobile responsiveness:
1. On screens < `lg`, sidebar is hidden by default
2. AppHeader gets a hamburger button (Menu icon) that toggles sidebar
3. Sidebar opens as a Sheet (overlay) on mobile using shadcn Sheet component
4. Sidebar auto-closes when a link is clicked on mobile

**Commit:** `feat: add mobile responsive sidebar with sheet overlay`

---

### Task 29: Loading Skeletons and Empty States

**Files:**
- Create: `frontend/src/components/dashboard/LoadingSkeleton.tsx`

Add loading skeletons for:
- Dashboard stats cards
- DataTable rows
- Form fields

Add empty state illustrations (using lucide-react icons) for:
- Empty tables
- No search results
- No data yet

**Commit:** `feat: add loading skeletons and empty state illustrations`

---

### Task 30: Final Build Verification and Cleanup

**Step 1: Run full build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

**Step 2: Run linter**

```bash
cd frontend && npm run lint
```

Fix any linting issues.

**Step 3: Clean up old imports**

Remove the old `Navbar.tsx` and `Sidebar.tsx` if they are no longer imported anywhere (keep them if the login page or other non-dashboard pages still use them).

**Step 4: Delete screenshot scripts**

```bash
rm screenshot_portal.py screenshot_sidebar.py
rm -rf screenshots_legacy/
```

**Step 5: Final commit**

```bash
git add .
git commit -m "chore: cleanup old components and build artifacts"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| **Phase 1: Foundation** | Tasks 1–10 | shadcn/ui, themes, layout shell, sidebar, header, DataTable |
| **Phase 2: Migration** | Tasks 11–23 | All existing pages migrated to shadcn/ui |
| **Phase 3: New Features** | Tasks 24–26 | Employee Transfer, Ticket Verification, Reports |
| **Phase 4: Polish** | Tasks 27–30 | Mobile responsive, loading states, cleanup |

**Total: 30 tasks across 4 phases.**
