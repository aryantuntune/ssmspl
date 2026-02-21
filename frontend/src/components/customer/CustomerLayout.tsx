"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import api from "@/lib/api";
import { clearPortalTokens } from "@/lib/portalAuth";
import {
  Menu,
  X,
  Ticket,
  History,
  Home,
  LogOut,
  ChevronDown,
} from "lucide-react";

interface CustomerInfo {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

const navLinks = [
  { label: "Book Ferry", href: "/customer/dashboard", icon: Ticket },
  { label: "Booking History", href: "/customer/history", icon: History },
  { label: "Home", href: "/", icon: Home },
];

export default function CustomerLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);

  useEffect(() => {
    api
      .get("/api/portal/auth/me")
      .then((res) => setCustomer(res.data))
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          clearPortalTokens();
          router.push("/customer/login");
        }
      });
  }, [router]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!isProfileOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu]")) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [isProfileOpen]);

  const handleLogout = () => {
    clearPortalTokens();
    router.push("/customer/login");
  };

  const displayName = customer
    ? `${customer.first_name} ${customer.last_name}`
    : "";
  const initial = customer?.first_name?.charAt(0).toUpperCase() ?? "?";

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50">
      {/* Glass Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-sky-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <Image
                src="/images/logos/logo.png"
                alt="Suvarnadurga Shipping"
                width={40}
                height={40}
                className="object-contain"
              />
              <span className="text-xl font-bold text-sky-900 tracking-tight">
                SSMSPL
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-2">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                      active
                        ? "bg-sky-100 text-sky-700"
                        : "text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User Menu (Desktop) */}
            <div className="hidden md:flex items-center gap-4">
              {customer ? (
                <div className="relative" data-profile-menu>
                  <button
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sky-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white text-sm font-bold">
                      {initial}
                    </div>
                    <span className="text-sm font-medium text-slate-700">
                      {displayName}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        isProfileOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isProfileOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-sky-100 py-2 z-50">
                      <div className="px-4 py-3 border-b border-sky-100">
                        <p className="text-sm font-medium text-slate-800">
                          {displayName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {customer.email}
                        </p>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors text-sm"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/customer/login"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all duration-300"
                >
                  Login
                </Link>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-sky-50 transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileOpen && (
          <div className="md:hidden border-t border-sky-100 bg-white">
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                      active
                        ? "bg-sky-100 text-sky-700"
                        : "text-slate-600 hover:bg-sky-50"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}

              {customer && (
                <div className="pt-4 border-t border-sky-100">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white font-bold">
                      {initial}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {displayName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {customer.email}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 font-medium transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-12 min-h-screen">
        {title && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-3xl font-bold text-slate-800">{title}</h1>
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-sky-900 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sky-200 text-sm">
            &copy; {new Date().getFullYear()} Suvarnadurga Shipping. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
