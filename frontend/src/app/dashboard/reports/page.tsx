"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Branch, Route, PaymentMode } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, BarChart3, Loader2 } from "lucide-react";

// ── Helpers ──

function formatDate(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(val: number | string): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "\u20B90.00";
  return `\u20B9${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRouteLabel(r: Route): string {
  return r.branch_one_name && r.branch_two_name
    ? `${r.branch_one_name} - ${r.branch_two_name}`
    : `Route ${r.id}`;
}

function getDefaultDateFrom(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ── Report Type Configuration ──

type FilterType = "date_range" | "single_date" | "branch" | "payment_mode" | "route";

interface ReportColumnConfig {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (row: Record<string, unknown>) => string;
}

interface ReportConfig {
  key: string;
  label: string;
  endpoint: string;
  pdfEndpoint: string;
  filters: FilterType[];
  columns: ReportColumnConfig[];
}

const REPORT_TYPES: ReportConfig[] = [
  {
    key: "date-wise-amount",
    label: "Date Wise Amount",
    endpoint: "/api/reports/date-wise-amount",
    pdfEndpoint: "/api/reports/date-wise-amount/pdf",
    filters: ["date_range", "branch", "payment_mode"],
    columns: [
      {
        key: "ticket_date",
        label: "Ticket Date",
        render: (r) => formatDate(r.ticket_date as string),
      },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (r) => formatCurrency(r.amount as number),
      },
    ],
  },
  {
    key: "ferry-wise-item",
    label: "Ferry Wise Item",
    endpoint: "/api/reports/ferry-wise-item",
    pdfEndpoint: "/api/reports/ferry-wise-item/pdf",
    filters: ["single_date", "branch", "payment_mode"],
    columns: [
      { key: "departure", label: "Time" },
      { key: "item_name", label: "Item" },
      { key: "quantity", label: "Quantity", align: "right" },
    ],
  },
  {
    key: "itemwise-levy",
    label: "Itemwise Levy",
    endpoint: "/api/reports/itemwise-levy",
    pdfEndpoint: "/api/reports/itemwise-levy/pdf",
    filters: ["date_range", "branch", "route"],
    columns: [
      { key: "item_name", label: "Item" },
      {
        key: "levy",
        label: "Levy",
        align: "right",
        render: (r) => formatCurrency(r.levy as number),
      },
      { key: "quantity", label: "Quantity", align: "right" },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (r) => formatCurrency(r.amount as number),
      },
    ],
  },
  {
    key: "payment-mode",
    label: "Payment Mode Wise",
    endpoint: "/api/reports/payment-mode",
    pdfEndpoint: "/api/reports/payment-mode/pdf",
    filters: ["date_range", "branch"],
    columns: [
      { key: "payment_mode_name", label: "Payment Mode" },
      { key: "ticket_count", label: "Ticket Count", align: "right" },
      {
        key: "ticket_revenue",
        label: "Amount",
        align: "right",
        render: (r) =>
          formatCurrency(
            Number(r.ticket_revenue) + Number(r.booking_revenue)
          ),
      },
    ],
  },
  {
    key: "ticket-details",
    label: "Ticket Details",
    endpoint: "/api/tickets/",
    pdfEndpoint: "/api/reports/ticket-details/pdf",
    filters: ["single_date", "branch"],
    columns: [
      {
        key: "ticket_date",
        label: "Date",
        render: (r) => formatDate(r.ticket_date as string),
      },
      { key: "ticket_no", label: "Ticket No" },
      { key: "departure", label: "Time" },
      { key: "payment_mode_name", label: "Payment Mode" },
      {
        key: "net_amount",
        label: "Amount",
        align: "right",
        render: (r) => formatCurrency(r.net_amount as number),
      },
      {
        key: "is_cancelled",
        label: "Status",
        render: (r) => (r.is_cancelled ? "Cancelled" : "Active"),
      },
    ],
  },
  {
    key: "user-wise-summary",
    label: "User Wise Daily",
    endpoint: "/api/reports/user-wise-summary",
    pdfEndpoint: "/api/reports/user-wise-summary/pdf",
    filters: ["single_date", "branch"],
    columns: [
      { key: "user_name", label: "User Name" },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (r) => formatCurrency(r.amount as number),
      },
    ],
  },
  {
    key: "vehicle-wise-tickets",
    label: "Vehicle Wise Tickets",
    endpoint: "/api/reports/vehicle-wise-tickets",
    pdfEndpoint: "/api/reports/vehicle-wise-tickets/pdf",
    filters: ["single_date", "branch"],
    columns: [
      {
        key: "ticket_date",
        label: "Date",
        render: (r) => formatDate(r.ticket_date as string),
      },
      { key: "ticket_no", label: "Ticket No" },
      { key: "departure", label: "Time" },
      { key: "payment_mode", label: "Payment Mode" },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (r) => formatCurrency(r.amount as number),
      },
      { key: "vehicle_no", label: "Vehicle No" },
    ],
  },
  {
    key: "branch-summary",
    label: "Branch Summary",
    endpoint: "/api/reports/branch-summary",
    pdfEndpoint: "/api/reports/branch-summary/pdf",
    filters: ["date_range"],
    columns: [
      { key: "branch_name", label: "Branch" },
      { key: "ticket_count", label: "Tickets", align: "right" },
      { key: "booking_count", label: "Bookings", align: "right" },
      {
        key: "ticket_revenue",
        label: "Ticket Revenue",
        align: "right",
        render: (r) => formatCurrency(r.ticket_revenue as number),
      },
      {
        key: "booking_revenue",
        label: "Booking Revenue",
        align: "right",
        render: (r) => formatCurrency(r.booking_revenue as number),
      },
      {
        key: "total_revenue",
        label: "Total Revenue",
        align: "right",
        render: (r) => formatCurrency(r.total_revenue as number),
      },
    ],
  },
];

// ── Main Component ──

export default function ReportsPage() {
  // Active tab index
  const [activeIndex, setActiveIndex] = useState(0);

  // Filter state
  const [dateFrom, setDateFrom] = useState(getDefaultDateFrom);
  const [dateTo, setDateTo] = useState(getToday);
  const [singleDate, setSingleDate] = useState(getToday);
  const [branchId, setBranchId] = useState("");
  const [paymentModeId, setPaymentModeId] = useState("");
  const [routeId, setRouteId] = useState("");

  // Dropdown data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);

  // Report results
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [grandTotal, setGrandTotal] = useState<Record<string, unknown> | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);

  // PDF download
  const [downloading, setDownloading] = useState(false);

  const activeReport = REPORT_TYPES[activeIndex];

  // Fetch dropdown data once on mount
  const fetchDropdowns = useCallback(async () => {
    try {
      const [branchResp, routeResp, pmResp] = await Promise.all([
        api.get<Branch[]>(
          "/api/branches/?limit=200&status=active&sort_by=name&sort_order=asc"
        ),
        api.get<Route[]>("/api/routes/?limit=200&status=active"),
        api.get<PaymentMode[]>("/api/payment-modes/?limit=200&status=active"),
      ]);
      setBranches(branchResp.data);
      setRoutes(routeResp.data);
      setPaymentModes(pmResp.data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  // Clear results when switching tabs
  const handleTabChange = (index: number) => {
    setActiveIndex(index);
    setRows([]);
    setGrandTotal(null);
    setError("");
    setHasGenerated(false);
  };

  // Build filter params for the active report
  const buildFilterParams = useCallback(() => {
    const config = REPORT_TYPES[activeIndex];
    const params: Record<string, string> = {};

    if (config.filters.includes("date_range")) {
      params.date_from = dateFrom;
      params.date_to = dateTo;
    }
    if (config.filters.includes("single_date")) {
      params.date = singleDate;
    }
    if (config.filters.includes("branch") && branchId) {
      params.branch_id = branchId;
    }
    if (config.filters.includes("payment_mode") && paymentModeId) {
      params.payment_mode_id = paymentModeId;
    }
    if (config.filters.includes("route") && routeId) {
      params.route_id = routeId;
    }
    return params;
  }, [activeIndex, dateFrom, dateTo, singleDate, branchId, paymentModeId, routeId]);

  // Generate report
  const generateReport = useCallback(async () => {
    setLoading(true);
    setError("");
    setHasGenerated(true);
    try {
      const config = REPORT_TYPES[activeIndex];
      const params = buildFilterParams();

      // Ticket details endpoint has a different response shape
      if (config.key === "ticket-details") {
        const ticketParams: Record<string, string> = {
          date_from: params.date || getToday(),
          date_to: params.date || getToday(),
          limit: "1000",
        };
        if (params.branch_id) {
          ticketParams.branch_filter = params.branch_id;
        }
        const response = await api.get(config.endpoint, {
          params: ticketParams,
        });
        const data = response.data;
        setRows(Array.isArray(data) ? data : []);
        setGrandTotal(null);
      } else {
        const response = await api.get(config.endpoint, { params });
        const data = response.data;
        if (data && typeof data === "object" && !Array.isArray(data)) {
          setRows(Array.isArray(data.rows) ? data.rows : []);
          setGrandTotal(data.grand_total ?? null);
        } else if (Array.isArray(data)) {
          setRows(data);
          setGrandTotal(null);
        } else {
          setRows([]);
          setGrandTotal(null);
        }
      }
    } catch {
      setError("Failed to load report data. Please try again.");
      setRows([]);
      setGrandTotal(null);
    } finally {
      setLoading(false);
    }
  }, [activeIndex, buildFilterParams]);

  // Download PDF
  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const params = buildFilterParams();
      const config = REPORT_TYPES[activeIndex];

      // For ticket-details, map params to the expected format
      const pdfParams =
        config.key === "ticket-details"
          ? {
              date_from: params.date || getToday(),
              date_to: params.date || getToday(),
              ...(params.branch_id ? { branch_id: params.branch_id } : {}),
            }
          : params;

      const response = await api.get(config.pdfEndpoint, {
        params: pdfParams,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${config.key}_report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  // Render cell value
  const renderCell = (
    row: Record<string, unknown>,
    col: ReportColumnConfig
  ): string => {
    if (col.render) {
      return col.render(row);
    }
    const value = row[col.key];
    if (value === null || value === undefined) return "\u2014";
    return String(value);
  };

  // Which filters to show for the active report
  const activeFilters = activeReport.filters;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate and download reports across various categories
          </p>
        </div>
        <Button
          onClick={downloadPdf}
          disabled={downloading || rows.length === 0}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {downloading ? "Downloading..." : "Download PDF"}
        </Button>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-0 scrollbar-thin">
        {REPORT_TYPES.map((report, index) => (
          <button
            key={report.key}
            onClick={() => handleTabChange(index)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              index === activeIndex
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
            }`}
          >
            {report.label}
          </button>
        ))}
      </div>

      {/* Filter Panel */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            {/* Date Range Filters */}
            {activeFilters.includes("date_range") && (
              <>
                <div>
                  <Label className="mb-1.5 block">From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full sm:w-[160px]"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full sm:w-[160px]"
                  />
                </div>
              </>
            )}

            {/* Single Date Filter */}
            {activeFilters.includes("single_date") && (
              <div>
                <Label className="mb-1.5 block">Date</Label>
                <Input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  className="w-full sm:w-[160px]"
                />
              </div>
            )}

            {/* Branch Filter */}
            {activeFilters.includes("branch") && (
              <div>
                <Label className="mb-1.5 block">Branch</Label>
                <Select
                  value={branchId || "all"}
                  onValueChange={(v) => setBranchId(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
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
            )}

            {/* Payment Mode Filter */}
            {activeFilters.includes("payment_mode") && (
              <div>
                <Label className="mb-1.5 block">Payment Mode</Label>
                <Select
                  value={paymentModeId || "all"}
                  onValueChange={(v) => setPaymentModeId(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="All Modes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    {paymentModes.map((pm) => (
                      <SelectItem key={pm.id} value={String(pm.id)}>
                        {pm.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Route Filter */}
            {activeFilters.includes("route") && (
              <div>
                <Label className="mb-1.5 block">Route</Label>
                <Select
                  value={routeId || "all"}
                  onValueChange={(v) => setRouteId(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="w-full sm:w-[220px]">
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
            )}

            {/* Generate Button */}
            <Button
              onClick={generateReport}
              disabled={loading}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-2" />
              )}
              {loading ? "Loading..." : "Generate Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Results Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                {activeReport.columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`font-semibold ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Skeleton loading rows
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {activeReport.columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={
                          col.align === "right" ? "text-right" : "text-left"
                        }
                      >
                        <Skeleton className="h-4 w-[70%] inline-block" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={activeReport.columns.length}
                    className="h-32 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <BarChart3 className="h-10 w-10" />
                      <p>
                        {hasGenerated
                          ? "No data found. Try adjusting your filters."
                          : "Select filters and click Generate Report to view data."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => (
                  <TableRow key={idx} className="hover:bg-muted/30">
                    {activeReport.columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={
                          col.align === "right" ? "text-right" : "text-left"
                        }
                      >
                        {renderCell(row, col)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
            {/* Grand Total Footer */}
            {grandTotal && rows.length > 0 && (
              <TableFooter>
                <TableRow className="font-semibold bg-muted/50">
                  {activeReport.columns.map((col, colIdx) => (
                    <TableCell
                      key={col.key}
                      className={`${col.align === "right" ? "text-right" : "text-left"} font-semibold`}
                    >
                      {colIdx === 0
                        ? "Grand Total"
                        : grandTotal[col.key] !== undefined
                          ? col.render
                            ? col.render(grandTotal)
                            : String(grandTotal[col.key])
                          : ""}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </div>

      {/* Row count footer */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {rows.length} {rows.length === 1 ? "row" : "rows"}
          </span>
        </div>
      )}
    </div>
  );
}
