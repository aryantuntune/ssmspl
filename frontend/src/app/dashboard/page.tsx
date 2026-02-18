"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { User } from "@/types";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api
      .get<User>("/api/auth/me")
      .then(({ data }) => setUser(data))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar user={user} />
      <div className="flex flex-1">
        <Sidebar menuItems={user.menu_items} />
        <main className="flex-1 p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Welcome, {user.full_name}!
          </h2>
          <p className="text-gray-500 mb-6">
            You are logged in as <span className="font-semibold text-blue-700">{user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {user.menu_items.map((item) => (
              <div
                key={item}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-gray-700">{item}</h3>
                <p className="text-sm text-gray-400 mt-1">Click to navigate</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
