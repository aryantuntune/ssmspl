"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";
import { ArrowLeft, ArrowRight, CheckCircle, RefreshCw } from "lucide-react";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback(() => {
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await api.post("/api/portal/auth/verify-email", { email, otp: code });
      setSuccess(true);
      setTimeout(() => router.push("/customer/login"), 2000);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        ?.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Verification failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      await api.post("/api/portal/auth/resend-otp?purpose=registration", { email });
      startCooldown();
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <div className="glass-card rounded-3xl p-8 md:p-10 shadow-2xl text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Invalid Link</h1>
        <p className="text-white/60 mb-6">No email address provided.</p>
        <Link
          href="/customer/register"
          className="btn-gradient inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-900"
        >
          Register
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="glass-card rounded-3xl p-8 md:p-10 shadow-2xl text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Email Verified!</h1>
        <p className="text-white/60 mb-6">
          Your email has been verified. Redirecting to login...
        </p>
        <Link
          href="/customer/login"
          className="btn-gradient inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-900"
        >
          Sign In
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-8 md:p-10 shadow-2xl">
      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Verify Your Email
        </h1>
        <p className="text-white/60">
          We sent a 6-digit code to
        </p>
        <p className="text-sky-300 font-medium mt-1">{email}</p>
      </div>

      {/* OTP Inputs */}
      <div className="flex justify-center gap-1.5 sm:gap-3 mb-6" onPaste={handlePaste}>
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className="input-glass w-9 h-11 sm:w-12 sm:h-14 md:w-14 md:h-16 rounded-lg sm:rounded-xl text-center text-xl sm:text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50"
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 text-sm text-red-200 bg-red-500/15 border border-red-400/20 rounded-xl p-3.5 mb-4">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Verify Button */}
      <button
        onClick={handleVerify}
        disabled={loading}
        className="btn-gradient w-full py-4 rounded-xl font-bold text-slate-900 text-lg flex items-center justify-center gap-2 disabled:opacity-70 mb-4"
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
        ) : (
          <span>Verify Email</span>
        )}
      </button>

      {/* Resend */}
      <div className="text-center">
        <p className="text-white/40 text-sm mb-2">Didn&apos;t receive the code?</p>
        <button
          onClick={handleResend}
          disabled={resendCooldown > 0 || resending}
          className="inline-flex items-center gap-2 text-sky-300 font-medium hover:text-sky-200 transition-colors disabled:text-white/30 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${resending ? "animate-spin" : ""}`} />
          {resendCooldown > 0
            ? `Resend in ${resendCooldown}s`
            : resending
              ? "Sending..."
              : "Resend Code"}
        </button>
      </div>

      {/* Back to Login */}
      <div className="text-center mt-6">
        <Link
          href="/customer/login"
          className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Login
        </Link>
      </div>
    </div>
  );
}

export default function CustomerVerifyEmailPage() {
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

          <Suspense
            fallback={
              <div className="glass-card rounded-3xl p-8 md:p-10 shadow-2xl text-center">
                <div className="w-8 h-8 mx-auto border-4 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            }
          >
            <VerifyEmailForm />
          </Suspense>

          <p className="text-center text-white/30 text-sm mt-8">
            &copy; {new Date().getFullYear()} SSMSPL. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
