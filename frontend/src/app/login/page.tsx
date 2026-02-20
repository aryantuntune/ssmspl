"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { setTokens, setSelectedBranch } from "@/lib/auth";
import { TokenResponse, LoginRequest, User, RouteBranch } from "@/types";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState<LoginRequest>({
    username: "billing_operator",
    password: "",
  });
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-800">SSMSPL</h1>
          <p className="text-sm text-gray-500 mt-1">
            Suvarnadurga Shipping & Marine Services Pvt. Ltd.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Ferry Boat Ticketing System
          </p>
        </div>

        {showBranchSelect ? (
          /* Branch Selection Step */
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-800">
                Select Your Branch
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Choose the branch you are operating from today
              </p>
            </div>

            <div className="space-y-3">
              {branches.map((branch) => (
                <button
                  key={branch.branch_id}
                  onClick={() => handleBranchSelect(branch)}
                  className="w-full flex items-center justify-between bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-5 py-4 transition"
                >
                  <span className="font-medium text-blue-800">
                    {branch.branch_name}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-5 h-5 text-blue-600"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Login Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; {new Date().getFullYear()} SSMSPL. All rights reserved.
        </p>
      </div>
    </div>
  );
}
