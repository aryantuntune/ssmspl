"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { setPortalTokens } from "@/lib/portalAuth";
import { TokenResponse } from "@/types";
import {
  Ship,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  UserPlus,
} from "lucide-react";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post<TokenResponse>("/api/portal/auth/login", form);
      setPortalTokens(data.access_token, data.refresh_token);
      router.push("/customer/dashboard");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Login failed. Please check your credentials.");
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
        {/* Fallback gradient when video hasn't loaded */}
        <div className="absolute inset-0 bg-gradient-to-br from-sky-900 via-blue-800 to-cyan-700 -z-10" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo & Brand */}
          <div className="text-center mb-8 animate-fade-in-up">
            <Link
              href="/"
              className="inline-flex items-center gap-3 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-xl group-hover:shadow-sky-500/50 transition-all duration-300">
                <Ship className="w-7 h-7 text-white" />
              </div>
              <span className="text-3xl font-bold text-white tracking-tight">
                SSMSPL
              </span>
            </Link>
          </div>

          {/* Login Card */}
          <div className="glass-card rounded-3xl p-8 md:p-10 shadow-2xl animate-fade-in-up-delayed">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                Welcome Back
              </h1>
              <p className="text-white/60">
                Sign in to book your next ferry journey
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
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
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="input-glass w-full pl-12 pr-4 py-3.5 rounded-xl text-white placeholder-white/50 focus:outline-none"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-white/80">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-white/40" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="input-glass w-full pl-12 pr-12 py-3.5 rounded-xl text-white placeholder-white/50 focus:outline-none"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 text-sm text-red-200 bg-red-500/15 border border-red-400/20 rounded-xl p-3.5">
                  <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-gradient w-full py-4 rounded-xl font-bold text-slate-900 text-lg flex items-center justify-center gap-2 group disabled:opacity-70"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 text-white/40">New to SSMSPL?</span>
              </div>
            </div>

            {/* Create Account Link */}
            <Link
              href="/customer/register"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl border border-white/20 text-white font-medium hover:bg-white/10 transition-all duration-300"
            >
              <UserPlus className="w-5 h-5" />
              <span>Create an Account</span>
            </Link>
          </div>

          {/* Back to Home */}
          <div className="text-center mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>
          </div>

          {/* Footer */}
          <p className="text-center text-white/30 text-sm mt-8">
            &copy; {new Date().getFullYear()} SSMSPL. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
