"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { User } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Ticket,
  Ship,
  MapPin,
  BarChart3,
  Shield,
  IndianRupee,
  ArrowRight,
} from "lucide-react";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount || 0);

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
};

interface TicketRow {
  id: number;
  ticket_no: number;
  branch_name?: string;
  route_name?: string;
  travel_date?: string;
  net_amount: number;
  status?: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState({
    ticketCount: 0,
    revenue: 0,
    activeFerries: 0,
    activeBranches: 0,
  });
  const [recentTickets, setRecentTickets] = useState<TicketRow[]>([]);

  useEffect(() => {
    api.get<User>("/api/auth/me").then(({ data }) => {
      setUser(data);

      const menu = data.menu_items || [];
      const canSeeTickets = menu.includes("Ticketing");
      const canSeeFerries = menu.includes("Ferries");
      const canSeeBranches = menu.includes("Branches");

      // Only fetch APIs the user's role can access
      const fetches: Promise<unknown>[] = [];
      const fetchKeys: string[] = [];

      if (canSeeTickets) {
        fetches.push(
          api.get("/api/tickets/", {
            params: { limit: 5, sort_by: "id", sort_order: "desc" },
          })
        );
        fetchKeys.push("tickets");
      }
      if (canSeeFerries) {
        fetches.push(
          api.get("/api/boats/", { params: { status: "active", limit: 1 } })
        );
        fetchKeys.push("boats");
      }
      if (canSeeBranches) {
        fetches.push(
          api.get("/api/branches/", { params: { status: "active", limit: 1 } })
        );
        fetchKeys.push("branches");
      }

      if (fetches.length === 0) return;

      Promise.allSettled(fetches).then((results) => {
        let ticketCount = 0;
        let revenue = 0;
        let activeFerries = 0;
        let activeBranches = 0;

        results.forEach((res, i) => {
          if (res.status !== "fulfilled") return;
          const d = (res as PromiseFulfilledResult<{ data: Record<string, unknown> }>).value.data;
          switch (fetchKeys[i]) {
            case "tickets":
              ticketCount = (d.total as number) || 0;
              setRecentTickets((d.data as TicketRow[]) || []);
              revenue = ((d.data as TicketRow[]) || []).reduce(
                (sum: number, t: TicketRow) => sum + (t.net_amount || 0),
                0
              );
              break;
            case "boats":
              activeFerries = (d.total as number) || 0;
              break;
            case "branches":
              activeBranches = (d.total as number) || 0;
              break;
          }
        });

        setStats({ ticketCount, revenue, activeFerries, activeBranches });
      });
    });
  }, []);

  if (!user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-12 w-12 rounded-xl" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const menu = user.menu_items || [];
  const roleLabel = user.role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Only show stat cards the user can access
  const allStatCards = [
    {
      label: "Tickets Issued",
      value: stats.ticketCount.toLocaleString("en-IN"),
      icon: Ticket,
      color: "text-blue-600",
      bg: "bg-blue-100",
      requires: "Ticketing",
    },
    {
      label: "Revenue",
      value: `₹${formatCurrency(stats.revenue)}`,
      icon: IndianRupee,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
      requires: "Ticketing",
    },
    {
      label: "Active Ferries",
      value: stats.activeFerries.toString(),
      icon: Ship,
      color: "text-amber-600",
      bg: "bg-amber-100",
      requires: "Ferries",
    },
    {
      label: "Active Branches",
      value: stats.activeBranches.toString(),
      icon: MapPin,
      color: "text-violet-600",
      bg: "bg-violet-100",
      requires: "Branches",
    },
  ];
  const statCards = allStatCards.filter((s) => menu.includes(s.requires));

  // Only show quick actions the user can access
  const allQuickActions = [
    {
      label: "New Ticket",
      desc: "Issue a new ferry ticket",
      icon: Ticket,
      href: "/dashboard/ticketing",
      color: "text-blue-600",
      requires: "Ticketing",
    },
    {
      label: "View Reports",
      desc: "Check revenue and analytics",
      icon: BarChart3,
      href: "/dashboard/reports",
      color: "text-emerald-600",
      requires: "Reports",
    },
    {
      label: "Verify Tickets",
      desc: "Scan and verify tickets",
      icon: Shield,
      href: "/dashboard/verify",
      color: "text-amber-600",
      requires: "Ticket Verification",
    },
  ];
  const quickActions = allQuickActions.filter((a) => menu.includes(a.requires));

  const canSeeTickets = menu.includes("Ticketing");

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="py-6">
          <h1 className="text-2xl font-bold">Welcome back, {user.full_name}!</h1>
          <p className="mt-1 opacity-90">
            Logged in as <span className="font-semibold">{roleLabel}</span>
          </p>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      {statCards.length > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(statCards.length, 4)} gap-4`}>
          {statCards.map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold mt-1">{s.value}</p>
                  </div>
                  <div className={`h-12 w-12 rounded-xl ${s.bg} flex items-center justify-center`}>
                    <s.icon className={`h-6 w-6 ${s.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
          <div className={`grid grid-cols-1 sm:grid-cols-${Math.min(quickActions.length, 3)} gap-4`}>
            {quickActions.map((a) => (
              <Link key={a.label} href={a.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className={`${a.color}`}>
                        <a.icon className="h-8 w-8" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{a.label}</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">{a.desc}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Tickets - only for roles that can see tickets */}
      {canSeeTickets && recentTickets.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Recent Tickets</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/ticketing">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                      <Ticket className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">#{ticket.ticket_no}</p>
                      <p className="text-xs text-muted-foreground">
                        {ticket.route_name || ticket.branch_name || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(ticket.travel_date || "")}
                    </span>
                    <Badge variant={ticket.status === "cancelled" ? "destructive" : "default"}>
                      {ticket.status || "active"}
                    </Badge>
                    <span className="text-sm font-semibold w-20 text-right">
                      ₹{formatCurrency(ticket.net_amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
