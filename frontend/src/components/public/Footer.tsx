"use client";

import Link from "next/link";
import Image from "next/image";

// Add your social media URLs here. Links with empty url are hidden automatically.
const SOCIAL_LINKS = [
  {
    label: "Facebook",
    url: "", // e.g. "https://facebook.com/ssmspl"
    icon: (
      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    url: "", // e.g. "https://instagram.com/ssmspl"
    icon: (
      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    label: "Twitter",
    url: "", // e.g. "https://twitter.com/ssmspl"
    icon: (
      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
      </svg>
    ),
  },
];

export default function Footer() {
  return (
    <footer>
      {/* Contact Info Bar - Bright Orange Gradient */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Dabhol Office */}
          <div className="text-center">
            <h4 className="font-bold text-white mb-3 text-lg">Dabhol Office</h4>
            <p className="text-white/90 text-sm">02348-248900</p>
            <p className="text-white/90 text-sm">+91 9767248900</p>
          </div>
          {/* Veshvi Office */}
          <div className="text-center">
            <h4 className="font-bold text-white mb-3 text-lg">Veshvi Office</h4>
            <p className="text-white/90 text-sm">02350-223300</p>
            <p className="text-white/90 text-sm">+91 8767980300</p>
          </div>
          {/* Operating Hours */}
          <div className="text-center">
            <h4 className="font-bold text-white mb-3 text-lg">Operating Hours</h4>
            <p className="text-white/90 text-sm">9:00 AM - 5:00 PM</p>
            <p className="text-white/90 text-sm">Open 7 Days a Week</p>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="bg-[#0a2a38] text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/images/logos/logo-white.png"
                alt="Suvarnadurga Shipping"
                width={44}
                height={44}
                className="object-contain"
              />
              <div className="leading-tight">
                <span className="font-bold text-white text-base">Suvarnadurga</span>
                <br />
                <span className="text-xs text-gray-400">Shipping &amp; Marine</span>
              </div>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Connecting Maharashtra&apos;s beautiful Konkan coast with reliable ferry services since 2003.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="text-gray-400 hover:text-amber-400 transition-colors">Home</Link></li>
              <li><Link href="/about" className="text-gray-400 hover:text-amber-400 transition-colors">About Us</Link></li>
              <li><Link href="/#routes" className="text-gray-400 hover:text-amber-400 transition-colors">Ferry Routes</Link></li>
              <li><Link href="/contact" className="text-gray-400 hover:text-amber-400 transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Ferry Routes */}
          <div>
            <h3 className="font-semibold text-white mb-4">Ferry Routes</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/route/dabhol-dhopave" className="text-gray-400 hover:text-amber-400 transition-colors">Dabhol - Dhopave</Link></li>
              <li><Link href="/route/jaigad-tawsal" className="text-gray-400 hover:text-amber-400 transition-colors">Jaigad - Tawsal</Link></li>
              <li><Link href="/route/dighi-agardande" className="text-gray-400 hover:text-amber-400 transition-colors">Dighi - Agardande</Link></li>
              <li><Link href="/route/veshvi-bagmandale" className="text-gray-400 hover:text-amber-400 transition-colors">Veshvi - Bagmandale</Link></li>
              <li><Link href="/route/vasai-bhayander" className="text-gray-400 hover:text-amber-400 transition-colors">Vasai - Bhayander</Link></li>
            </ul>
          </div>

          {/* Contact Us */}
          <div>
            <h3 className="font-semibold text-white mb-4">Contact Us</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-gray-400">Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd., Dapoli, Maharashtra</span>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <a href="tel:+919767248900" className="text-gray-400 hover:text-amber-400 transition-colors">+91 9767248900</a>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <a href="mailto:ssmsdapoli@rediffmail.com" className="text-gray-400 hover:text-amber-400 transition-colors">ssmsdapoli@rediffmail.com</a>
              </li>
            </ul>

            {/* Social Media Icons — add your URLs below */}
            <div className="flex items-center gap-3 mt-6">
              {SOCIAL_LINKS.map((social) => social.url && (
                <a
                  key={social.label}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-amber-500 flex items-center justify-center transition-colors"
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap justify-between items-center gap-2 text-sm text-gray-400">
            <p>&copy; 2026 Suvarnadurga Shipping &amp; Marine Services. All rights reserved.</p>
            <Link href="/login" className="hover:text-amber-400 transition-colors">
              Staff Login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
