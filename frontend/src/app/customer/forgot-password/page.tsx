"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";

export default function CustomerForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/portal/auth/forgot-password", { email });
      setStep(2);
      startCooldown();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
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

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      await api.post("/api/portal/auth/resend-otp?purpose=password_reset", { email });
      startCooldown();
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const code = otp.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/portal/auth/reset-password", {
        email,
        otp: code,
        new_password: password,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        ?.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Failed to reset password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Video Background */}
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

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
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

          {/* Card */}
          <div className="glass-card rounded-3xl p-8 md:p-10 shadow-2xl">
            {success ? (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Password Reset!</h1>
                <p className="text-white/60 mb-6">
                  Your password has been reset successfully. Sign in now.
                </p>
                <Link
                  href="/customer/login"
                  className="btn-gradient inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-900"
                >
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : step === 1 ? (
              <>
                <div className="text-center mb-8">
                  <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    Forgot Password?
                  </h1>
                  <p className="text-white/60">
                    Enter your email and we&apos;ll send you a verification code.
                  </p>
                </div>

                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail className="w-5 h-5 text-white/40" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input-glass w-full pl-12 pr-4 py-3.5 rounded-xl text-white placeholder-white/50 focus:outline-none"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 text-sm text-red-200 bg-red-500/15 border border-red-400/20 rounded-xl p-3.5">
                      <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-gradient w-full py-4 rounded-xl font-bold text-slate-900 text-lg flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                    ) : (
                      <span>Send Verification Code</span>
                    )}
                  </button>
                </form>

                <div className="text-center mt-6">
                  <Link
                    href="/customer/login"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Login
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    Reset Password
                  </h1>
                  <p className="text-white/60">
                    Enter the code sent to
                  </p>
                  <p className="text-sky-300 font-medium mt-1">{email}</p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-5">
                  {/* OTP Inputs */}
                  <div className="flex justify-center gap-3" onPaste={handleOtpPaste}>
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { inputRefs.current[index] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className="input-glass w-12 h-14 md:w-14 md:h-16 rounded-xl text-center text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                      />
                    ))}
                  </div>

                  {/* Resend */}
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendCooldown > 0 || resending}
                      className="inline-flex items-center gap-2 text-sky-300 text-sm font-medium hover:text-sky-200 transition-colors disabled:text-white/30 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
                      {resendCooldown > 0
                        ? `Resend in ${resendCooldown}s`
                        : resending
                          ? "Sending..."
                          : "Resend Code"}
                    </button>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">New Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="w-5 h-5 text-white/40" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-glass w-full pl-12 pr-12 py-3.5 rounded-xl text-white placeholder-white/50 focus:outline-none"
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/40 hover:text-white/70 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="text-xs text-white/40 mt-1.5">Must be at least 8 characters</p>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Confirm Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="w-5 h-5 text-white/40" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="input-glass w-full pl-12 pr-4 py-3.5 rounded-xl text-white placeholder-white/50 focus:outline-none"
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 text-sm text-red-200 bg-red-500/15 border border-red-400/20 rounded-xl p-3.5">
                      <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-gradient w-full py-4 rounded-xl font-bold text-slate-900 text-lg flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                    ) : (
                      <span>Reset Password</span>
                    )}
                  </button>
                </form>

                <div className="text-center mt-6">
                  <Link
                    href="/customer/login"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Login
                  </Link>
                </div>
              </>
            )}
          </div>

          <p className="text-center text-white/30 text-sm mt-8">
            &copy; {new Date().getFullYear()} SSMSPL. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
