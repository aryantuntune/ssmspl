"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { User } from "@/types";
import { useDashboardWS } from "@/hooks/useDashboardWS";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RevenueChart from "@/components/charts/RevenueChart";
import BranchComparisonChart from "@/components/charts/BranchComparisonChart";
import ItemSplitChart from "@/components/charts/ItemSplitChart";
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

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

interface TicketRow {
  id: number;
  ticket_no: number;
  branch_name?: string;
  route_name?: string;
  travel_date?: string;
  net_amount: number;
  status?: string;
}

interface TodaySummary {
  total_tickets: number;
  total_revenue: number;
  branch_breakdown: { branch_name: string; ticket_count: number; total_revenue: number }[];
  payment_mode_breakdown: { payment_mode: string; ticket_count: number; total_revenue: number }[];
}

interface RevenueRow {
  period: string;
  total_revenue: number;
}

interface BranchRow {
  branch_name: string;
  total_revenue: number;
  ticket_count: number;
}

interface ItemRow {
  item_name: string;
  is_vehicle: boolean;
  total_revenue: number;
  total_quantity: number;
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

  // New dashboard data states
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueRow[]>([]);
  const [branchData, setBranchData] = useState<BranchRow[]>([]);
  const [itemData, setItemData] = useState<ItemRow[]>([]);
  const [revenuePeriod, setRevenuePeriod] = useState<7 | 30>(7);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  // Real-time stats via WebSocket
  const { stats: wsStats, connected: wsConnected } = useDashboardWS();

  // Merge WebSocket stats into display stats when available
  useEffect(() => {
    if (wsStats) {
      setStats({
        ticketCount: wsStats.ticket_count,
        revenue: wsStats.today_revenue,
        activeFerries: wsStats.active_ferries,
        activeBranches: wsStats.active_branches,
      });
    }
  }, [wsStats]);

  const fetchEnhancedSections = useCallback(
    async (days: number) => {
      setSectionsLoading(true);
      try {
        const today = new Date();
        const todayStr = toISODate(today);
        const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
        const periodStart = new Date(today);
        periodStart.setDate(periodStart.getDate() - (days - 1));
        const periodStartStr = toISODate(periodStart);

        const [summaryRes, revenueRes, branchRes, itemRes] = await Promise.all([
          api.get("/api/dashboard/today-summary"),
          api.get("/api/reports/revenue", {
            params: {
              date_from: periodStartStr,
              date_to: todayStr,
              grouping: "day",
            },
          }),
          api.get("/api/reports/branch-summary", {
            params: { date_from: monthStart, date_to: todayStr },
          }),
          api.get("/api/reports/item-breakdown", {
            params: { date_from: monthStart, date_to: todayStr },
          }),
        ]);

        setTodaySummary(summaryRes.data);
        setRevenueData(revenueRes.data.rows || []);
        setBranchData(branchRes.data.rows || []);
        setItemData(itemRes.data.rows || []);
      } catch (err) {
        console.error("Dashboard data fetch error:", err);
      } finally {
        setSectionsLoading(false);
      }
    },
    []
  );

  const handleRevenuePeriodChange = useCallback(
    (days: 7 | 30) => {
      setRevenuePeriod(days);
      // Only re-fetch revenue data with the new period
      const today = new Date();
      const todayStr = toISODate(today);
      const periodStart = new Date(today);
      periodStart.setDate(periodStart.getDate() - (days - 1));
      const periodStartStr = toISODate(periodStart);

      api
        .get("/api/reports/revenue", {
          params: {
            date_from: periodStartStr,
            date_to: todayStr,
            grouping: "day",
          },
        })
        .then(({ data }) => {
          setRevenueData(data.rows || []);
        })
        .catch((err) => {
          console.error("Revenue fetch error:", err);
        });
    },
    []
  );

  useEffect(() => {
    api.get<User>("/api/auth/me").then(({ data }) => {
      setUser(data);

      const menu = data.menu_items || [];
      const canSeeTickets = menu.includes("Ticketing");

      // Fetch initial stats via HTTP (fallback / first paint)
      api
        .get<{ ticket_count: number; today_revenue: number; active_ferries: number; active_branches: number }>(
          "/api/dashboard/stats"
        )
        .then(({ data: s }) => {
          setStats({
            ticketCount: s.ticket_count,
            revenue: s.today_revenue,
            activeFerries: s.active_ferries,
            activeBranches: s.active_branches,
          });
        })
        .catch(() => {
          /* non-fatal -- WS will provide updates */
        });

      // Fetch recent tickets separately
      if (canSeeTickets) {
        api
          .get("/api/tickets/", {
            params: { limit: 5, sort_by: "id", sort_order: "desc" },
          })
          .then(({ data: d }) => {
            const ticketData = d as { data?: TicketRow[] };
            setRecentTickets(ticketData.data || []);
          })
          .catch(() => {
            /* non-fatal */
          });
      }

      // Fetch enhanced dashboard sections for users with Reports permission
      if (menu.includes("Reports")) {
        fetchEnhancedSections(7);
      } else {
        setSectionsLoading(false);
      }
    });
  }, [fetchEnhancedSections]);

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
  const canSeeReports = menu.includes("Reports");

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
      value: `\u20B9${formatCurrency(stats.revenue)}`,
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

  // Derive top 5 items from item data, sorted by revenue
  const topItems = [...itemData]
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 5);

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
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold">Overview</h2>
            {wsConnected && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Live
              </span>
            )}
          </div>
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
                      {"\u20B9"}{formatCurrency(ticket.net_amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Enhanced Dashboard Sections (Reports permission required) ── */}
      {canSeeReports && (
        <>
          {/* Section 1: Today's Collection Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Today&apos;s Collection</CardTitle>
            </CardHeader>
            <CardContent>
              {sectionsLoading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Skeleton className="h-20 rounded-xl" />
                    <Skeleton className="h-20 rounded-xl" />
                  </div>
                  <Skeleton className="h-40 rounded-xl" />
                </div>
              ) : todaySummary ? (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <p className="text-sm text-blue-600 font-medium">Total Tickets</p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">
                        {todaySummary.total_tickets.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <p className="text-sm text-emerald-600 font-medium">Total Revenue</p>
                      <p className="text-2xl font-bold text-emerald-900 mt-1">
                        {"\u20B9"}{formatCurrency(todaySummary.total_revenue)}
                      </p>
                    </div>
                  </div>

                  {/* Branch Breakdown Table */}
                  {todaySummary.branch_breakdown && todaySummary.branch_breakdown.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">By Branch</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Branch Name</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Tickets</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {todaySummary.branch_breakdown.map((row) => (
                              <tr key={row.branch_name} className="border-b border-border last:border-0">
                                <td className="py-2 px-3">{row.branch_name}</td>
                                <td className="py-2 px-3 text-right">{row.ticket_count.toLocaleString("en-IN")}</td>
                                <td className="py-2 px-3 text-right font-medium">{"\u20B9"}{formatCurrency(row.total_revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Payment Mode Breakdown Table */}
                  {todaySummary.payment_mode_breakdown && todaySummary.payment_mode_breakdown.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">By Payment Mode</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Payment Mode</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Tickets</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {todaySummary.payment_mode_breakdown.map((row) => (
                              <tr key={row.payment_mode} className="border-b border-border last:border-0">
                                <td className="py-2 px-3">{row.payment_mode}</td>
                                <td className="py-2 px-3 text-right">{row.ticket_count.toLocaleString("en-IN")}</td>
                                <td className="py-2 px-3 text-right font-medium">{"\u20B9"}{formatCurrency(row.total_revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Handle empty summary data */}
                  {todaySummary.total_tickets === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No collections recorded today</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Revenue Trend */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Revenue Trend</CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={revenuePeriod === 7 ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRevenuePeriodChange(7)}
                >
                  7 Days
                </Button>
                <Button
                  variant={revenuePeriod === 30 ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRevenuePeriodChange(30)}
                >
                  30 Days
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sectionsLoading ? (
                <Skeleton className="h-[300px] rounded-xl" />
              ) : revenueData.length > 0 ? (
                <RevenueChart data={revenueData} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Branch Comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Branch Performance (This Month)</CardTitle>
            </CardHeader>
            <CardContent>
              {sectionsLoading ? (
                <Skeleton className="h-[250px] rounded-xl" />
              ) : branchData.length > 0 ? (
                <BranchComparisonChart data={branchData} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
              )}
            </CardContent>
          </Card>

          {/* Section 4: Top Items */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Item Performance (This Month)</CardTitle>
            </CardHeader>
            <CardContent>
              {sectionsLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Skeleton className="h-[300px] rounded-xl" />
                  <Skeleton className="h-[300px] rounded-xl" />
                </div>
              ) : itemData.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Donut Chart */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Vehicle vs Passenger Revenue</h3>
                    <ItemSplitChart data={itemData} />
                  </div>

                  {/* Top 5 Items Table */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Top 5 Items</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Item Name</th>
                            <th className="text-right py-2 px-3 text-muted-foreground font-medium">Quantity</th>
                            <th className="text-right py-2 px-3 text-muted-foreground font-medium">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topItems.map((item) => (
                            <tr key={item.item_name} className="border-b border-border last:border-0">
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  {item.item_name}
                                  <Badge variant="outline" className="text-xs">
                                    {item.is_vehicle ? "Vehicle" : "Passenger"}
                                  </Badge>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right">{item.total_quantity.toLocaleString("en-IN")}</td>
                              <td className="py-2 px-3 text-right font-medium">{"\u20B9"}{formatCurrency(item.total_revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {topItems.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No items data available</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
