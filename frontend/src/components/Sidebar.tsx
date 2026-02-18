"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  menuItems: string[];
}

// Map menu item names to routes
const MENU_ROUTES: Record<string, string> = {
  Dashboard: "/dashboard",
  "User Management": "/dashboard/users",
  "Ferry Management": "/dashboard/ferries",
  "Route Management": "/dashboard/routes",
  Ticketing: "/dashboard/ticketing",
  Payments: "/dashboard/payments",
  Reports: "/dashboard/reports",
  "System Settings": "/dashboard/settings",
  "Ticket Verification": "/dashboard/verify",
};

export default function Sidebar({ menuItems }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 min-h-full flex flex-col py-6 px-3">
      <nav className="space-y-1">
        {menuItems.map((item) => {
          const href = MENU_ROUTES[item] || "/dashboard";
          const active = pathname === href;
          return (
            <Link
              key={item}
              href={href}
              className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                active
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {item}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
