"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  LogIn,
  User,
  Phone,
  X,
  CheckCircle,
  XCircle,
} from "lucide-react";

export default function CustomerRegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    mobile: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{
    show: boolean;
    type: string;
    title: string;
    message: string;
    showLinks: boolean;
  }>({ show: false, type: "", title: "", message: "", showLinks: false });
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  const updateField = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const showAlertModal = (
    type: string,
    title: string,
    message: string,
    showLinks = false
  ) => {
    setAlert({ show: true, type, title, message, showLinks });
  };

  const closeAlert = () => {
    setAlert((prev) => ({ ...prev, show: false }));
  };

  const handleSubmit = async () => {
    if (
      !formData.first_name ||
      !formData.last_name ||
      !formData.mobile ||
      !formData.email ||
      !formData.password
    ) {
      showAlertModal("error", "Missing Fields", "Please fill in all required fields.");
      return;
    }

    if (formData.password.length < 6) {
      showAlertModal(
        "error",
        "Weak Password",
        "Password must be at least 6 characters."
      );
      return;
    }

    setLoading(true);

    try {
      await api.post("/api/portal/auth/register", formData);
      setLoading(false);
      showAlertModal(
        "success",
        "Account Created!",
        "Your account has been created successfully. Redirecting to login..."
      );
      redirectTimer.current = setTimeout(() => {
        router.push("/customer/login");
      }, 2000);
    } catch (err: unknown) {
      setLoading(false);
      const detail = (
        err as { response?: { data?: { detail?: unknown } } }
      )?.response?.data?.detail;
      if (typeof detail === "string") {
        showAlertModal(
          "error",
          "Registration Failed",
          detail,
          detail.includes("already")
        );
      } else {
        showAlertModal(
          "error",
          "Error",
          "Something went wrong. Please try again."
        );
      }
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
          {/* Logo & Brand */}
          <div className="text-center mb-8 animate-fade-in-up">
            <Link
              href="/"
              className="inline-flex items-center gap-3 group"
            >
              <Image
                src="/images/logos/logo-white.png"
                alt="Suvarnadurga Shipping"
                width={56}
                height={56}
                className="object-contain drop-shadow-lg"
              />
              <span className="text-3xl font-bold text-white tracking-tight">
                SSMSPL
              </span>
            </Link>
          </div>

          {/* Register Card */}
          <div className="glass-card rounded-3xl p-8 md:p-10 shadow-2xl animate-fade-in-up-delayed">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                Create Account
              </h1>
              <p className="text-white/60">
                Join us for seamless ferry booking
              </p>
            </div>

            {/* Registration Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="space-y-4"
            >
              {/* Name Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    First Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="w-4 h-4 text-white/40" />
                    </div>
                    <input
                      type="text"
                      value={formData.first_name}
                      onChange={(e) =>
                        updateField("first_name", e.target.value)
                      }
                      className="input-glass w-full pl-10 pr-3 py-3 rounded-xl text-white placeholder-white/50 focus:outline-none text-sm"
                      placeholder="First"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => updateField("last_name", e.target.value)}
                    className="input-glass w-full px-3 py-3 rounded-xl text-white placeholder-white/50 focus:outline-none text-sm"
                    placeholder="Last"
                    required
                  />
                </div>
              </div>

              {/* Mobile */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Mobile Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Phone className="w-5 h-5 text-white/40" />
                  </div>
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => updateField("mobile", e.target.value)}
                    className="input-glass w-full pl-12 pr-4 py-3.5 rounded-xl text-white placeholder-white/50 focus:outline-none"
                    placeholder="Enter your mobile number"
                    required
                  />
                </div>
              </div>

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
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    className="input-glass w-full pl-12 pr-4 py-3.5 rounded-xl text-white placeholder-white/50 focus:outline-none"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-white/40" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    className="input-glass w-full pl-12 pr-12 py-3.5 rounded-xl text-white placeholder-white/50 focus:outline-none"
                    placeholder="Create a strong password"
                    required
                    minLength={6}
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
                <p className="text-xs text-white/40 mt-2">
                  Must be at least 6 characters
                </p>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient w-full py-4 rounded-xl font-bold text-slate-900 text-lg flex items-center justify-center gap-2 group disabled:opacity-70"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 text-white/40">
                  Already have an account?
                </span>
              </div>
            </div>

            {/* Login Link */}
            <Link
              href="/customer/login"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl border border-white/20 text-white font-medium hover:bg-white/10 transition-all duration-300"
            >
              <LogIn className="w-5 h-5" />
              <span>Sign In Instead</span>
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

      {/* Alert Modal */}
      {alert.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeAlert}
          />
          <div className="glass-card rounded-3xl p-8 w-full max-w-md relative animate-scale-up">
            <button
              onClick={closeAlert}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>

            <div className="text-center mb-6">
              <div
                className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-lg mb-4 ${
                  alert.type === "error"
                    ? "bg-gradient-to-br from-red-400 to-red-600"
                    : "bg-gradient-to-br from-green-400 to-green-600"
                }`}
              >
                {alert.type === "error" ? (
                  <XCircle className="w-8 h-8 text-white" />
                ) : (
                  <CheckCircle className="w-8 h-8 text-white" />
                )}
              </div>
              <h2
                className={`text-2xl font-bold mb-2 ${
                  alert.type === "error" ? "text-red-400" : "text-green-400"
                }`}
              >
                {alert.title}
              </h2>
              <p className="text-white/60">{alert.message}</p>
            </div>

            {alert.showLinks && (
              <div className="space-y-3 mb-6">
                <Link
                  href="/customer/login"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-sky-500/20 text-sky-300 font-medium hover:bg-sky-500/30 transition-colors"
                >
                  <LogIn className="w-5 h-5" />
                  <span>Go to Login</span>
                </Link>
              </div>
            )}

            <button
              onClick={closeAlert}
              className="w-full py-3.5 rounded-xl bg-white/10 border border-white/20 text-white font-medium hover:bg-white/20 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
