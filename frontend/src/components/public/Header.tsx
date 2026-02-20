"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { getAccessToken, clearTokens } from "@/lib/auth";
import { getPortalAccessToken, clearPortalTokens } from "@/lib/portalAuth";

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isPortalUser, setIsPortalUser] = useState(false);

  useEffect(() => {
    const portalToken = !!getPortalAccessToken();
    const adminToken = !!getAccessToken();
    setIsPortalUser(portalToken);
    setIsLoggedIn(portalToken || adminToken);
  }, []);

  const handleLogout = () => {
    clearTokens();
    clearPortalTokens();
    setIsLoggedIn(false);
    window.location.href = "/";
  };

  const dashboardHref = isPortalUser ? "/customer/dashboard" : "/dashboard";

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Ferry Routes", href: "/#routes" },
    { label: "About Us", href: "/about" },
    { label: "Contact", href: "/contact" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/#")) return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="w-full">
      {/* Top Bar */}
      <div className="bg-[#0c3547] text-white text-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <a href="tel:+919767248900" className="flex items-center gap-1 hover:text-orange-300 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              +91 9767248900
            </a>
            <a href="mailto:ssmsdapoli@rediffmail.com" className="flex items-center gap-1 hover:text-orange-300 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              ssmsdapoli@rediffmail.com
            </a>
          </div>
          <div className="flex items-center gap-1 text-amber-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Operating: 9 AM - 5 PM (7 Days)
          </div>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-[#0891b2] rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v-2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1.007 1.007 0 00-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" />
              </svg>
            </div>
            <div className="leading-tight">
              <span className="font-bold text-[#0c3547] text-base group-hover:text-[#0891b2] transition-colors">Suvarnadurga</span>
              <br />
              <span className="text-xs text-amber-500">Shipping &amp; Marine Services</span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "text-[#0891b2] bg-cyan-50"
                    : "text-gray-600 hover:text-[#0891b2] hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {isLoggedIn ? (
              <>
                <Link
                  href="/customer/dashboard"
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg"
                >
                  My Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-sm font-semibold text-red-500 hover:text-red-700 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/customer/login"
                  className="text-sm font-semibold text-sky-600 hover:text-sky-800 transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/customer/login"
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg"
                >
                  Book Now
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-white px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm font-medium ${
                  isActive(link.href)
                    ? "text-[#0891b2] bg-cyan-50"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t pt-3 mt-2 flex flex-col gap-2">
              {isLoggedIn ? (
                <>
                  <Link
                    href="/customer/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-center bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                  >
                    My Dashboard
                  </Link>
                  <button
                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="text-center text-sm font-semibold text-red-500"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/customer/login" onClick={() => setMobileMenuOpen(false)} className="text-center text-sm font-semibold text-sky-600">
                    Login
                  </Link>
                  <Link
                    href="/customer/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-center bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                  >
                    Book Now
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
