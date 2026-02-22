"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";
import { User } from "@/types";

interface NavbarProps {
  user: User;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  billing_operator: "Billing Operator",
  ticket_checker: "Ticket Checker",
};

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="bg-blue-800 text-white px-6 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-3">
        <Image
          src="/images/logos/logo-white.png"
          alt="Suvarnadurga Shipping"
          width={36}
          height={36}
          className="object-contain"
        />
        <div>
          <span className="text-xl font-bold tracking-wide">SSMSPL</span>
          <span className="ml-3 text-blue-300 text-sm">Ferry Ticketing System</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold">{user.full_name}</p>
          <p className="text-xs text-blue-300">{ROLE_LABELS[user.role] || user.role}</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/change-password")}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg transition"
        >
          Change Password
        </button>
        <button
          onClick={handleLogout}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg transition"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
