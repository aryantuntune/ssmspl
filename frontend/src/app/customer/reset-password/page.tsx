"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function CustomerResetPasswordPage() {
  const router = useRouter();

  useEffect(() => {
    // Old token-based reset links are no longer valid.
    // Redirect to the new OTP-based forgot-password flow after a brief delay.
    const timer = setTimeout(() => {
      router.push("/customer/forgot-password");
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover"
          style={{ filter: "brightness(0.5)" }}
        >
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-br from-sky-900 via-blue-800 to-cyan-700 -z-10" />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-3">
              <Image
                src="/images/logos/logo-white.png"
                alt="Suvarnadurga Shipping"
                width={56}
                height={56}
                className="object-contain drop-shadow-lg"
              />
              <span className="text-3xl font-bold text-white tracking-tight">SSMSPL</span>
            </Link>
          </div>

          <div className="glass-card rounded-3xl p-8 md:p-10 shadow-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Link Expired</h1>
            <p className="text-white/60 mb-6">
              Password reset links are no longer used. Redirecting you to the new password reset flow...
            </p>
            <Link
              href="/customer/forgot-password"
              className="btn-gradient inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-900"
            >
              Reset Password
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <p className="text-center text-white/30 text-sm mt-8">
            &copy; {new Date().getFullYear()} SSMSPL. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
