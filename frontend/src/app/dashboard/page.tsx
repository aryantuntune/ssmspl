"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { DATA_CUTOFF_DATE } from "@/lib/utils";
import { User } from "@/types";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";
import { useDashboardWS } from "@/hooks/useDashboardWS";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RevenueChart from "@/components/charts/RevenueChart";
import BranchComparisonChart from "@/components/charts/BranchComparisonChart";
import ItemSplitChart from "@/components/charts/ItemSplitChart";
import ItemQuantityChart from "@/components/charts/ItemQuantityChart";
import {
  Ticket,
  Ship,
  MapPin,
  BarChart3,
  Shield,
  IndianRupee,
  ArrowRight,
  RefreshCw,
  CalendarDays,
} from "lucide-react";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

// Branch display order: grouped by route (from → to)
const BRANCH_ORDER = [
  "Dabhol", "Dhopave",
  "Veshvi", "Bagmandale",
  "Jaigad", "Tavsal",
  "Agardanda", "Dighi",
  "Vasai", "Bhayander",
  "Virar", "Safale",
];

const PAYMENT_MODE_ORDER = ["Cash", "UPI", "Card", "Online"];

function sortByOrder<T>(items: T[], key: keyof T, order: string[]): T[] {
  return [...items].sort((a, b) => {
    const ai = order.findIndex((o) => o.toLowerCase() === String(a[key]).toLowerCase());
    const bi = order.findIndex((o) => o.toLowerCase() === String(b[key]).toLowerCase());
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
}

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
  total_cancelled: number;
  total_revenue: number;
  branch_breakdown: { branch_name: string; ticket_count: number; cancelled_count: number; total_revenue: number }[];
  payment_mode_breakdown: { payment_mode: string; ticket_count: number; total_revenue: number }[];
}

interface RevenueRow {
  period: string;
  total_revenue: number;
  ticket_count?: number;
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

interface PaymentTrendRow {
  payment_mode_name: string;
  total_revenue: number;
  total_count: number;
}

export default function DashboardPage() {
  const user = useDashboardUser();
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
  const [revenuePeriod, setRevenuePeriod] = useState<7 | 30 | "mtd">(7);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(toISODate(new Date()));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [paymentTrendData, setPaymentTrendData] = useState<PaymentTrendRow[]>([]);
  // Force re-render every 30s so "Updated X min ago" stays current
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Real-time stats via WebSocket
  const { stats: wsStats, connected: wsConnected } = useDashboardWS();
  // Track whether WS has already delivered live data for today — prevents HTTP from overwriting it
  const wsHasData = useRef(false);

  // Merge WebSocket stats into display stats only when viewing today
  useEffect(() => {
    if (wsStats && selectedDate === toISODate(new Date())) {
      wsHasData.current = true;
      setStats({
        ticketCount: wsStats.ticket_count,
        revenue: wsStats.today_revenue,
        activeFerries: wsStats.active_ferries,
        activeBranches: wsStats.active_branches,
      });
    }
  }, [wsStats, selectedDate]);

  const fetchEnhancedSections = useCallback(
    async (days: 7 | 30 | "mtd", forDate?: string) => {
      setSectionsLoading(true);
      try {
        const targetDate = forDate || toISODate(new Date());
        const dateObj = new Date(targetDate + "T00:00:00");
        const monthStart = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-01`;
        let periodStart: Date;
        if (days === "mtd") {
          periodStart = new Date(monthStart + "T00:00:00");
        } else {
          periodStart = new Date(dateObj);
          periodStart.setDate(periodStart.getDate() - ((days as number) - 1));
        }
        const periodStartStr = toISODate(periodStart);

        const [summaryRes, revenueRes, branchRes, itemRes, statsRes, paymentTrendRes] = await Promise.allSettled([
          api.get("/api/dashboard/today-summary", { params: { date: targetDate } }),
          api.get("/api/reports/revenue", {
            params: { date_from: periodStartStr, date_to: targetDate, grouping: "day" },
          }),
          api.get("/api/reports/branch-summary", {
            params: { date_from: monthStart, date_to: targetDate },
          }),
          api.get("/api/reports/item-breakdown", {
            params: { date_from: monthStart, date_to: targetDate },
          }),
          api.get("/api/dashboard/stats", { params: { date: targetDate } }),
          api.get("/api/reports/payment-mode", {
            params: { date_from: periodStartStr, date_to: targetDate },
          }),
        ]);

        if (summaryRes.status === "fulfilled") {
          const raw = summaryRes.value.data;
          setTodaySummary({
            total_tickets: raw.total_tickets ?? 0,
            total_cancelled: raw.total_cancelled ?? 0,
            total_revenue: raw.total_revenue ?? 0,
            branch_breakdown: (raw.branches || raw.branch_breakdown || []).map(
              (b: { branch_name: string; ticket_count: number; cancelled_count?: number; revenue?: number; total_revenue?: number }) => ({
                branch_name: b.branch_name,
                ticket_count: b.ticket_count ?? 0,
                cancelled_count: b.cancelled_count ?? 0,
                total_revenue: b.total_revenue ?? b.revenue ?? 0,
              })
            ),
            payment_mode_breakdown: (raw.payment_modes || raw.payment_mode_breakdown || []).map(
              (p: { payment_mode_name?: string; payment_mode?: string; ticket_count: number; revenue?: number; total_revenue?: number }) => ({
                payment_mode: p.payment_mode ?? p.payment_mode_name ?? "",
                ticket_count: p.ticket_count ?? 0,
                total_revenue: p.total_revenue ?? p.revenue ?? 0,
              })
            ),
          });
        }

        if (revenueRes.status === "fulfilled") {
          setRevenueData(revenueRes.value.data.rows || []);
        }

        if (branchRes.status === "fulfilled") {
          setBranchData(
            (branchRes.value.data.rows || []).map(
              (r: { branch_name: string; total_revenue?: number; ticket_count?: number }) => ({
                branch_name: r.branch_name ?? "",
                total_revenue: r.total_revenue ?? 0,
                ticket_count: r.ticket_count ?? 0,
              })
            )
          );
        }

        if (itemRes.status === "fulfilled") {
          setItemData(
            (itemRes.value.data.rows || []).map(
              (r: { item_name: string; is_vehicle?: boolean; total_revenue?: number; total_qty?: number; total_quantity?: number }) => ({
                item_name: r.item_name ?? "",
                is_vehicle: r.is_vehicle ?? false,
                total_revenue: r.total_revenue ?? 0,
                total_quantity: r.total_quantity ?? r.total_qty ?? 0,
              })
            )
          );
        }

        // Update stat cards for the selected date
        // Skip if viewing today and WebSocket has already delivered fresh data (prevents race overwrite)
        const isViewingToday = targetDate === toISODate(new Date());
        if (statsRes.status === "fulfilled" && !(isViewingToday && wsHasData.current)) {
          const s = statsRes.value.data;
          setStats({
            ticketCount: s.ticket_count,
            revenue: s.today_revenue,
            activeFerries: s.active_ferries,
            activeBranches: s.active_branches,
          });
        }

        // Payment mode trend
        if (paymentTrendRes.status === "fulfilled") {
          setPaymentTrendData(
            (paymentTrendRes.value.data.rows || []).map(
              (r: { payment_mode_name?: string; total_revenue?: number; total_count?: number }) => ({
                payment_mode_name: r.payment_mode_name ?? "",
                total_revenue: r.total_revenue ?? 0,
                total_count: r.total_count ?? 0,
              })
            )
          );
        }

        setLastUpdated(new Date());
      } catch {
        // errors handled per-request via allSettled
      } finally {
        setSectionsLoading(false);
      }
    },
    []
  );

  const handleRevenuePeriodChange = useCallback(
    (days: 7 | 30 | "mtd", forDate?: string) => {
      setRevenuePeriod(days);
      const targetDate = forDate || toISODate(new Date());
      const dateObj = new Date(targetDate + "T00:00:00");
      let periodStart: Date;
      if (days === "mtd") {
        periodStart = new Date(
          `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-01T00:00:00`
        );
      } else {
        periodStart = new Date(dateObj);
        periodStart.setDate(periodStart.getDate() - ((days as number) - 1));
      }
      const periodStartStr = toISODate(periodStart);

      api
        .get("/api/reports/revenue", {
          params: { date_from: periodStartStr, date_to: targetDate, grouping: "day" },
        })
        .then(({ data }) => {
          setRevenueData(data.rows || []);
        })
        .catch(() => {
          // non-fatal — chart will retain previous data
        });
    },
    []
  );

  // Fetch dashboard data on mount (user already available from DashboardShell)
  useEffect(() => {
    const menu = user.menu_items || [];
    const canSeeTickets = menu.includes("Ticketing");

    // Fetch initial stats via HTTP (fallback / first paint)
    api
      .get<{ ticket_count: number; today_revenue: number; active_ferries: number; active_branches: number }>(
        "/api/dashboard/stats",
        { params: { date: toISODate(new Date()) } }
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
        .get("/api/tickets", {
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
      fetchEnhancedSections(7, toISODate(new Date()));
    } else {
      setSectionsLoading(false);
    }
  }, [user, fetchEnhancedSections]);

  // Re-fetch all sections when the selected date changes (date picker interaction)
  useEffect(() => {
    if (!user) return;
    if (!(user.menu_items || []).includes("Reports")) return;
    // Reset WS-data guard when switching to a historical date — HTTP stats should apply there
    if (selectedDate !== toISODate(new Date())) wsHasData.current = false;
    fetchEnhancedSections(revenuePeriod, selectedDate);
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 5 minutes — only when viewing today
  useEffect(() => {
    if (!user || !(user.menu_items || []).includes("Reports")) return;
    const interval = setInterval(() => {
      const todayStr = toISODate(new Date());
      if (selectedDate === todayStr) {
        fetchEnhancedSections(revenuePeriod, todayStr);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, selectedDate, revenuePeriod, fetchEnhancedSections]);

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

  // Date-picker derived values
  const todayStr = toISODate(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = toISODate(yesterdayDate);
  const isToday = selectedDate === todayStr;
  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const monthLabel = selectedDateObj.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const collectionLabel = isToday
    ? "Today\u2019s Collection"
    : `Collection \u2014 ${selectedDateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  const lastUpdatedLabel = lastUpdated
    ? (() => {
        const mins = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
        return mins === 0 ? "Just now" : `${mins} min ago`;
      })()
    : null;

  // Only show stat cards the user can access
  const allStatCards = [
    {
      label: isToday ? "Tickets Today" : "Tickets Issued",
      value: (stats.ticketCount ?? 0).toLocaleString("en-IN"),
      icon: Ticket,
      color: "text-blue-600",
      bg: "bg-blue-100",
      requires: "Ticketing",
    },
    {
      label: isToday ? "Today\u2019s Revenue" : "Revenue",
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
    .sort((a, b) => (b.total_revenue ?? 0) - (a.total_revenue ?? 0))
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Overview</h2>
              {wsConnected && isToday && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  Live
                </span>
              )}
              {!isToday && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                  Historical
                </span>
              )}
            </div>
            {/* Date picker — visible to admins/managers (Reports permission) */}
            {canSeeReports && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">
                  <Button
                    variant={isToday ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDate(todayStr)}
                  >
                    Today
                  </Button>
                  <Button
                    variant={selectedDate === yesterdayStr ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDate(yesterdayStr)}
                  >
                    Yesterday
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 border border-input rounded-md px-3 py-1.5 bg-background text-sm">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="date"
                    value={selectedDate}
                    min={user?.role !== "SUPER_ADMIN" ? DATA_CUTOFF_DATE : undefined}
                    max={todayStr}
                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                    className="bg-transparent outline-none cursor-pointer"
                  />
                </div>
              </div>
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
          {/* Section 1: Collection Summary */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">{collectionLabel}</CardTitle>
              <div className="flex items-center gap-2">
                {lastUpdatedLabel && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">Updated {lastUpdatedLabel}</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchEnhancedSections(revenuePeriod, selectedDate)}
                  disabled={sectionsLoading}
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${sectionsLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sectionsLoading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Skeleton className="h-20 rounded-xl" />
                    <Skeleton className="h-20 rounded-xl" />
                    <Skeleton className="h-20 rounded-xl" />
                  </div>
                  <Skeleton className="h-40 rounded-xl" />
                </div>
              ) : todaySummary ? (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <p className="text-sm text-blue-600 font-medium">Total Tickets</p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">
                        {(todaySummary.total_tickets ?? 0).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <p className="text-sm text-emerald-600 font-medium">Total Revenue</p>
                      <p className="text-2xl font-bold text-emerald-900 mt-1">
                        {"\u20B9"}{formatCurrency(todaySummary.total_revenue)}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-sm text-slate-600 font-medium">Avg. Ticket Value</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">
                        {todaySummary.total_tickets > 0
                          ? `\u20B9${formatCurrency(todaySummary.total_revenue / todaySummary.total_tickets)}`
                          : "\u2014"}
                      </p>
                    </div>
                  </div>
                  {todaySummary.total_cancelled > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                        {todaySummary.total_cancelled} ticket{todaySummary.total_cancelled !== 1 ? "s" : ""} cancelled
                      </span>
                    </div>
                  )}

                  {/* Branch Breakdown Table with inline progress bars */}
                  {todaySummary.branch_breakdown && todaySummary.branch_breakdown.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">By Branch</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Branch Name</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Tickets</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Cancelled</th>
                              <th className="py-2 px-3 text-muted-foreground font-medium w-24"></th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const rows = sortByOrder(todaySummary.branch_breakdown, "branch_name", BRANCH_ORDER);
                              const maxRev = Math.max(...rows.map((r) => r.total_revenue), 1);
                              return rows.map((row) => (
                                <tr key={row.branch_name} className="border-b border-border last:border-0">
                                  <td className="py-2 px-3">{row.branch_name}</td>
                                  <td className="py-2 px-3 text-right">{(row.ticket_count ?? 0).toLocaleString("en-IN")}</td>
                                  <td className="py-2 px-3 text-right">
                                    {(row.cancelled_count ?? 0) > 0 ? (
                                      <span className="text-red-500 font-medium">{row.cancelled_count}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="h-2 bg-muted rounded-full overflow-hidden w-full">
                                      <div
                                        className="h-full bg-blue-400 rounded-full"
                                        style={{ width: `${Math.round((row.total_revenue / maxRev) * 100)}%` }}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-right font-medium">{"\u20B9"}{formatCurrency(row.total_revenue)}</td>
                                </tr>
                              ));
                            })()}
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
                              <th className="py-2 px-3 text-muted-foreground font-medium w-24"></th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const rows = sortByOrder(todaySummary.payment_mode_breakdown, "payment_mode", PAYMENT_MODE_ORDER);
                              const maxRev = Math.max(...rows.map((r) => r.total_revenue), 1);
                              const pmColors: Record<string, string> = { Cash: "bg-emerald-400", UPI: "bg-blue-400", Card: "bg-amber-400", Online: "bg-violet-400" };
                              return rows.map((row) => (
                                <tr key={row.payment_mode} className="border-b border-border last:border-0">
                                  <td className="py-2 px-3">{row.payment_mode}</td>
                                  <td className="py-2 px-3 text-right">{(row.ticket_count ?? 0).toLocaleString("en-IN")}</td>
                                  <td className="py-2 px-3">
                                    <div className="h-2 bg-muted rounded-full overflow-hidden w-full">
                                      <div
                                        className={`h-full rounded-full ${pmColors[row.payment_mode] ?? "bg-primary"}`}
                                        style={{ width: `${Math.round((row.total_revenue / maxRev) * 100)}%` }}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-right font-medium">{"\u20B9"}{formatCurrency(row.total_revenue)}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Handle empty summary data */}
                  {todaySummary.total_tickets === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Ticket className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {isToday ? "No tickets issued yet" : "No tickets on this date"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isToday ? "Entries will appear here as tickets are printed" : "Try selecting a different date"}
                      </p>
                    </div>
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
                  onClick={() => handleRevenuePeriodChange(7, selectedDate)}
                >
                  7D
                </Button>
                <Button
                  variant={revenuePeriod === 30 ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRevenuePeriodChange(30, selectedDate)}
                >
                  30D
                </Button>
                <Button
                  variant={revenuePeriod === "mtd" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRevenuePeriodChange("mtd", selectedDate)}
                >
                  MTD
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sectionsLoading ? (
                <Skeleton className="h-[300px] rounded-xl" />
              ) : revenueData.length > 0 ? (
                <RevenueChart data={revenueData} />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No revenue data for this period</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Branch Comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Branch Performance ({monthLabel})</CardTitle>
            </CardHeader>
            <CardContent>
              {sectionsLoading ? (
                <div className="space-y-12">
                  <div>
                    <div className="flex justify-between mb-2">
                      <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                      <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="h-[300px] bg-muted rounded-xl animate-pulse" />
                  </div>
                </div>
              ) : branchData.length > 0 ? (
                <BranchComparisonChart data={branchData} />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <MapPin className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No branch data this month</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 4: Payment Mode Trend */}
          {paymentTrendData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Payment Mode Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(() => {
                    const maxRev = Math.max(...paymentTrendData.map((r) => r.total_revenue), 1);
                    const colors: Record<string, string> = {
                      Cash: "bg-emerald-500",
                      UPI: "bg-blue-500",
                      Card: "bg-amber-500",
                      Online: "bg-violet-500",
                    };
                    return sortByOrder(
                      paymentTrendData.filter((r) => r.total_revenue > 0),
                      "payment_mode_name",
                      PAYMENT_MODE_ORDER
                    ).map((row) => (
                      <div key={row.payment_mode_name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{row.payment_mode_name}</span>
                          <span className="text-muted-foreground">
                            {row.total_count} tickets &middot; {"\u20B9"}{formatCurrency(row.total_revenue)}
                          </span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              colors[row.payment_mode_name] ?? "bg-primary"
                            }`}
                            style={{ width: `${Math.round((row.total_revenue / maxRev) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 5: Top Items */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Item Performance ({monthLabel})</CardTitle>
            </CardHeader>
            <CardContent>
              {sectionsLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-[300px] bg-muted rounded-xl animate-pulse" />
                  <div className="h-[300px] bg-muted rounded-xl animate-pulse" />
                </div>
              ) : itemData.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Revenue split donut */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Vehicle vs Passenger Revenue</h3>
                    <ItemSplitChart data={itemData} />
                  </div>

                  {/* Quantity bar chart */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Volume by Item</h3>
                    <ItemQuantityChart data={itemData} />
                  </div>

                  {/* Top 5 Items Table */}
                  <div className="lg:col-span-2">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Top 5 Items by Revenue</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Item Name</th>
                            <th className="text-right py-2 px-3 text-muted-foreground font-medium">Quantity</th>
                            <th className="py-2 px-3 w-28"></th>
                            <th className="text-right py-2 px-3 text-muted-foreground font-medium">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topItems.map((item) => {
                            const maxRev = Math.max(...topItems.map((i) => i.total_revenue), 1);
                            return (
                              <tr key={item.item_name} className="border-b border-border last:border-0">
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    {item.item_name}
                                    <Badge variant="outline" className="text-xs">
                                      {item.is_vehicle ? "Vehicle" : "Passenger"}
                                    </Badge>
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right">{(item.total_quantity ?? 0).toLocaleString("en-IN")}</td>
                                <td className="py-2 px-3">
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-400 rounded-full"
                                      style={{ width: `${Math.round((item.total_revenue / maxRev) * 100)}%` }}
                                    />
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-medium">{"\u20B9"}{formatCurrency(item.total_revenue)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {topItems.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <p className="text-sm text-muted-foreground">No items data available</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No item data this month</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
