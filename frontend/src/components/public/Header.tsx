"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import { logout } from "@/lib/auth";
import { portalLogout } from "@/lib/portalAuth";

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isPortalUser, setIsPortalUser] = useState(false);

  useEffect(() => {
    // Try portal auth first, then admin auth
    api.get("/api/portal/auth/me")
      .then(() => {
        setIsPortalUser(true);
        setIsLoggedIn(true);
      })
      .catch(() => {
        api.get("/api/auth/me")
          .then(() => {
            setIsPortalUser(false);
            setIsLoggedIn(true);
          })
          .catch(() => {
            setIsLoggedIn(false);
          });
      });
  }, []);

  const handleLogout = async () => {
    await Promise.all([logout(), portalLogout()]);
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
            <Image
              src="/images/logos/logo.png"
              alt="Suvarnadurga Shipping"
              width={44}
              height={44}
              className="object-contain"
            />
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
                  href={dashboardHref}
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
                    href={dashboardHref}
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
