"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Ticket, Branch, Route, PaymentMode } from "@/types";
import DataTable, { Column } from "@/components/dashboard/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Download,
  Ticket as TicketIcon,
  IndianRupee,
  TrendingUp,
  CreditCard,
} from "lucide-react";

function formatRouteLabel(r: Route): string {
  return r.branch_one_name && r.branch_two_name
    ? `${r.branch_one_name} - ${r.branch_two_name}`
    : `Route ${r.id}`;
}

function getDefaultDateFrom(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getDefaultDateTo(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function ReportsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Pagination & sorting
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("ticket_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filters
  const [branchFilter, setBranchFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [paymentModeFilter, setPaymentModeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(getDefaultDateFrom);
  const [dateTo, setDateTo] = useState(getDefaultDateTo);
  const [statusFilter, setStatusFilter] = useState("");

  // Dropdown data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [branchResp, routeResp, pmResp] = await Promise.all([
        api.get<Branch[]>("/api/branches/?limit=200&status=active&sort_by=name&sort_order=asc"),
        api.get<Route[]>("/api/routes/?limit=200&status=active"),
        api.get<PaymentMode[]>("/api/payment-modes/?limit=200&status=active"),
      ]);
      setBranches(branchResp.data);
      setRoutes(routeResp.data);
      setPaymentModes(pmResp.data);
    } catch {
      // non-critical — dropdowns will be empty
    }
  }, []);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (branchFilter) params.set("branch_filter", branchFilter);
    if (routeFilter) params.set("route_filter", routeFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (statusFilter) params.set("status", statusFilter);
    if (paymentModeFilter) params.set("payment_mode_filter", paymentModeFilter);
    return params;
  }, [branchFilter, routeFilter, dateFrom, dateTo, statusFilter, paymentModeFilter]);

  const fetchTickets = useCallback(async () => {
    setTableLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = buildFilterParams();
      params.set("skip", String(skip));
      params.set("limit", String(pageSize));
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);

      const countParams = buildFilterParams();

      const [pageResp, countResp] = await Promise.all([
        api.get<Ticket[]>(`/api/tickets/?${params}`),
        api.get<number>(`/api/tickets/count?${countParams}`),
      ]);

      setTickets(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load ticket data.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, buildFilterParams]);

  useEffect(() => {
    fetchTickets();
    fetchDropdowns();
  }, [fetchTickets, fetchDropdowns]);

  // Computed stats from current page data
  const pageRevenue = tickets.reduce((sum, t) => sum + t.net_amount, 0);
  const activeTicketsOnPage = tickets.filter((t) => !t.is_cancelled).length;
  const avgTicketValue = tickets.length > 0 ? pageRevenue / tickets.length : 0;

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = buildFilterParams();
      params.set("skip", "0");
      params.set("limit", "10000");
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);

      const resp = await api.get<Ticket[]>(`/api/tickets/?${params}`);
      const allTickets = resp.data;

      const csvHeaders =
        "ID,Ticket No,Branch,Route,Date,Departure,Amount,Discount,Net Amount,Payment Mode,Status\n";
      const csvRows = allTickets
        .map(
          (t) =>
            `${t.id},${t.ticket_no},"${t.branch_name || ""}","${t.route_name || ""}",${t.ticket_date},${t.departure || ""},${t.amount},${t.discount || 0},${t.net_amount},"${t.payment_mode_name || ""}",${t.is_cancelled ? "Cancelled" : "Active"}`
        )
        .join("\n");

      const blob = new Blob([csvHeaders + csvRows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tickets-report-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export CSV. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setBranchFilter("");
    setRouteFilter("");
    setPaymentModeFilter("");
    setDateFrom(getDefaultDateFrom());
    setDateTo(getDefaultDateTo());
    setStatusFilter("");
    setPage(1);
  };

  const hasActiveFilters =
    branchFilter ||
    routeFilter ||
    paymentModeFilter ||
    statusFilter ||
    dateFrom !== getDefaultDateFrom() ||
    dateTo !== getDefaultDateTo();

  const columns: Column<Ticket>[] = [
    {
      key: "id",
      label: "ID",
      sortable: true,
      render: (t) => <span className="text-muted-foreground">{t.id}</span>,
    },
    {
      key: "ticket_no",
      label: "Ticket No",
      sortable: true,
      render: (t) => <span className="font-medium">{t.ticket_no}</span>,
    },
    {
      key: "branch_name",
      label: "Branch",
      sortable: true,
      render: (t) => <span>{t.branch_name || "\u2014"}</span>,
    },
    {
      key: "route_name",
      label: "Route",
      sortable: true,
      render: (t) => <span>{t.route_name || "\u2014"}</span>,
    },
    {
      key: "ticket_date",
      label: "Date",
      sortable: true,
    },
    {
      key: "departure",
      label: "Departure",
      sortable: true,
      render: (t) => <span>{t.departure || "\u2014"}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      className: "text-right",
      render: (t) => <span>{t.amount.toFixed(2)}</span>,
    },
    {
      key: "discount",
      label: "Discount",
      sortable: true,
      className: "text-right",
      render: (t) => <span>{t.discount != null ? t.discount.toFixed(2) : "0.00"}</span>,
    },
    {
      key: "net_amount",
      label: "Net Amount",
      sortable: true,
      className: "text-right",
      render: (t) => <span className="font-medium">{t.net_amount.toFixed(2)}</span>,
    },
    {
      key: "payment_mode_name",
      label: "Payment Mode",
      render: (t) => <span>{t.payment_mode_name || "\u2014"}</span>,
    },
    {
      key: "is_cancelled",
      label: "Status",
      sortable: true,
      render: (t) =>
        t.is_cancelled ? (
          <Badge variant="destructive">Cancelled</Badge>
        ) : (
          <Badge variant="default">Active</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View ticket reports and analytics
          </p>
        </div>
        <Button onClick={handleExportCSV} disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1.5 block">Branch</Label>
              <Select
                value={branchFilter || "all"}
                onValueChange={(v) => {
                  setBranchFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Route</Label>
              <Select
                value={routeFilter || "all"}
                onValueChange={(v) => {
                  setRouteFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All Routes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Routes</SelectItem>
                  {routes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {formatRouteLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Payment Mode</Label>
              <Select
                value={paymentModeFilter || "all"}
                onValueChange={(v) => {
                  setPaymentModeFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {paymentModes.map((pm) => (
                    <SelectItem key={pm.id} value={String(pm.id)}>
                      {pm.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-[160px]"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-[160px]"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Select
                value={statusFilter || "all"}
                onValueChange={(v) => {
                  setStatusFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tickets</p>
                <p className="text-2xl font-bold">{totalCount.toLocaleString("en-IN")}</p>
              </div>
              <TicketIcon className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(pageRevenue)}</p>
                <p className="text-xs text-muted-foreground">Page total</p>
              </div>
              <IndianRupee className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Ticket Value</p>
                <p className="text-2xl font-bold">{formatCurrency(avgTicketValue)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Tickets</p>
                <p className="text-2xl font-bold">{activeTicketsOnPage}</p>
              </div>
              <CreditCard className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <DataTable<Ticket>
        columns={columns}
        data={tickets}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage="No tickets found for the selected filters."
        emptyIcon={<BarChart3 className="h-10 w-10" />}
      />

      {/* Page Total Footer */}
      {tickets.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">Page Total:</span>
              <span className="font-medium">{formatCurrency(pageRevenue)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
