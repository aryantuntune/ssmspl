"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { setTokens, setSelectedBranch } from "@/lib/auth";
import { TokenResponse, LoginRequest, User, RouteBranch } from "@/types";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState<LoginRequest>({
    username: "",
    password: "",
  });
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Branch selection step
  const [branches, setBranches] = useState<RouteBranch[]>([]);
  const [showBranchSelect, setShowBranchSelect] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post<TokenResponse>("/api/auth/login", form);
      setTokens(data.access_token, data.refresh_token);

      // Fetch user profile to check for route/branches
      const { data: me } = await api.get<User>("/api/auth/me");

      if (me.route_branches && me.route_branches.length > 0) {
        setBranches(me.route_branches);
        setShowBranchSelect(true);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail;
      let msg: string;
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail
          .map((e: { msg?: string }) => e.msg || "Validation error")
          .join("; ");
      } else {
        msg = "Login failed. Please check your credentials.";
      }
      setError(msg);
    } finally {
      if (!showBranchSelect) setLoading(false);
    }
  };

  const handleBranchSelect = (branch: RouteBranch) => {
    setSelectedBranch(branch.branch_id, branch.branch_name);
    router.push("/dashboard");
  };

  return (
    <div className="font-sans antialiased min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-700 bg-[length:400%_400%] animate-gradient">
      {/* Custom animations */}
      <style jsx>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-gradient { animation: gradientShift 15s ease infinite; }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-delayed-2 { animation: float 6s ease-in-out infinite 2s; }
        .animate-float-delayed-4 { animation: float 6s ease-in-out infinite 4s; }
        .animate-slide-up { animation: slideUp 0.5s ease-out forwards; }
        .animate-slide-up-delayed-1 { animation: slideUp 0.5s ease-out 0.1s forwards; opacity: 0; }
        .animate-slide-up-delayed-2 { animation: slideUp 0.5s ease-out 0.2s forwards; opacity: 0; }
        .animate-slide-up-delayed-3 { animation: slideUp 0.5s ease-out 0.3s forwards; opacity: 0; }
        .animate-fade-in-delayed { animation: fadeIn 0.5s ease-out 0.3s forwards; opacity: 0; }
      `}</style>

      {/* Floating circles decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/10 animate-float" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-white/5 animate-float-delayed-2" />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 rounded-full bg-white/5 animate-float-delayed-4" />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8 animate-slide-up">
          <Link href="/" className="inline-flex items-center space-x-3 group">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-xl flex items-center justify-center group-hover:shadow-2xl transition-shadow">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-indigo-600"
              >
                <path d="M12 10.189V14" />
                <path d="M12 2v3" />
                <path d="M19 13a7 7 0 1 0-14 0" />
                <path d="M3 19h18" />
                <path d="M5 19v2" />
                <path d="M19 19v2" />
              </svg>
            </div>
            <span className="text-3xl font-bold text-white">SSMSPL</span>
          </Link>
          <p className="mt-2 text-white/70 text-sm">Admin Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-10 animate-slide-up-delayed-1">
          {showBranchSelect ? (
            /* Branch Selection Step */
            <div>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">
                  Select Branch
                </h1>
                <p className="text-slate-500">
                  Choose the branch you&apos;re operating from today
                </p>
              </div>

              <div className="space-y-3">
                {branches.map((branch) => (
                  <button
                    key={branch.branch_id}
                    onClick={() => handleBranchSelect(branch)}
                    className="w-full group flex items-center justify-between bg-slate-50 hover:bg-indigo-50 border-2 border-slate-200 hover:border-indigo-300 rounded-xl px-5 py-4 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <span className="font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors">
                        {branch.branch_name}
                      </span>
                    </div>
                    <svg className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Login Form */
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">
                  Welcome Back
                </h1>
                <p className="text-slate-500">
                  Sign in to access the admin dashboard
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Username */}
                <div className="animate-slide-up-delayed-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-slate-400"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      required
                      value={form.username}
                      onChange={(e) =>
                        setForm({ ...form, username: e.target.value })
                      }
                      className="w-full border-2 border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                      placeholder="Enter your username"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="animate-slide-up-delayed-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-slate-400"
                      >
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                      className="w-full border-2 border-slate-200 rounded-xl pl-12 pr-12 py-3.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center gap-2 animate-slide-up-delayed-3">
                  <input
                    type="checkbox"
                    id="remember"
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="remember" className="text-sm text-slate-500 select-none cursor-pointer">
                    Remember me
                  </label>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2.5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">
                    <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Sign In Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-semibold text-white text-lg flex items-center justify-center space-x-2 bg-gradient-to-br from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 animate-slide-up-delayed-3"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6 animate-fade-in-delayed">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 text-white/80 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Copyright */}
        <p className="text-center text-sm text-white/50 mt-4 animate-fade-in-delayed">
          &copy; {new Date().getFullYear()} SSMSPL. All rights reserved.
        </p>
      </div>
    </div>
  );
}
