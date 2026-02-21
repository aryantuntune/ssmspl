import {
  LayoutDashboard, Ticket, TicketCheck, BarChart3,
  Ship, MapPin, Route as RouteIcon, Clock, Package, DollarSign,
  CreditCard, Users, ArrowLeftRight, Settings, Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface MenuEntry {
  label: string;
  icon: LucideIcon;
  href: string;
}

export interface MenuGroup {
  label: string;
  items: MenuEntry[];
}

export interface SidebarSection {
  sectionLabel?: string;
  entries: (MenuEntry | MenuGroup)[];
}

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
