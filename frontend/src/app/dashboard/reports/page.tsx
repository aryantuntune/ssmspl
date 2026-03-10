"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Branch, Route, PaymentMode, User } from "@/types";
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
import { Download, BarChart3, Loader2, Printer } from "lucide-react";

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
  return getToday();
}

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ── Report Type Configuration ──

type FilterType = "date_range" | "single_date" | "branch" | "payment_mode" | "route" | "user";

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
    filters: ["date_range", "branch", "route", "payment_mode"],
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
    filters: ["single_date", "branch", "route", "payment_mode"],
    columns: [
      { key: "departure", label: "Time" },
      { key: "item_name", label: "Item" },
      { key: "quantity", label: "Quantity", align: "right" },
    ],
  },
  {
    key: "itemwise-levy",
    label: "Item Wise Summary",
    endpoint: "/api/reports/itemwise-levy",
    pdfEndpoint: "/api/reports/itemwise-levy/pdf",
    filters: ["date_range", "branch", "route"],
    columns: [
      { key: "item_name", label: "Item" },
      {
        key: "rate",
        label: "Rate",
        align: "right",
        render: (r) => formatCurrency(r.rate as number),
      },
      { key: "quantity", label: "Qty", align: "right" },
      {
        key: "net",
        label: "Net",
        align: "right",
        render: (r) => formatCurrency(r.net as number),
      },
    ],
  },
  {
    key: "payment-mode",
    label: "Payment Mode Wise",
    endpoint: "/api/reports/payment-mode",
    pdfEndpoint: "/api/reports/payment-mode/pdf",
    filters: ["date_range", "branch", "route"],
    columns: [
      { key: "payment_mode_name", label: "Payment Mode" },
      { key: "ticket_count", label: "Tickets", align: "right" },
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
    endpoint: "/api/reports/ticket-details",
    pdfEndpoint: "/api/reports/ticket-details/pdf",
    filters: ["single_date", "branch", "route"],
    columns: [
      {
        key: "ticket_date",
        label: "Ticket Date",
        render: (r) => formatDate(r.ticket_date as string),
      },
      { key: "ticket_no", label: "TicketNo" },
      { key: "payment_mode", label: "Payment Mode" },
      { key: "boat_name", label: "Boat Name" },
      { key: "departure", label: "Time" },
      { key: "ferry_type", label: "Ferry Type" },
      { key: "client_name", label: "ClientName" },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (r) => formatCurrency(r.amount as number),
      },
    ],
  },
  {
    key: "user-wise-summary",
    label: "User Wise Daily",
    endpoint: "/api/reports/user-wise-summary",
    pdfEndpoint: "/api/reports/user-wise-summary/pdf",
    filters: ["single_date", "branch", "route", "user"],
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
    filters: ["single_date", "branch", "route"],
    columns: [
      {
        key: "ticket_date",
        label: "Ticket Date",
        render: (r) => formatDate(r.ticket_date as string),
      },
      { key: "ticket_no", label: "TicketNo" },
      { key: "payment_mode", label: "Payment Mode" },
      { key: "boat_name", label: "Boat Name" },
      { key: "departure", label: "Time" },
      { key: "ferry_type", label: "Ferry Type" },
      { key: "vehicle_no", label: "VehicleNo" },
      { key: "vehicle_name", label: "VehicleName" },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (r) => formatCurrency(r.amount as number),
      },
    ],
  },
  {
    key: "branch-item-summary",
    label: "Branch Summary",
    endpoint: "/api/reports/branch-item-summary",
    pdfEndpoint: "/api/reports/branch-item-summary/pdf",
    filters: ["date_range", "branch", "route"],
    columns: [
      { key: "item_name", label: "Item" },
      {
        key: "rate",
        label: "Rate",
        align: "right",
        render: (r) => formatCurrency(r.rate as number),
      },
      { key: "quantity", label: "Qty", align: "right" },
      {
        key: "net",
        label: "Net",
        align: "right",
        render: (r) => formatCurrency(r.net as number),
      },
    ],
  },
];

// ── Print Stylesheet ──

const PRINT_STYLES = `
@media print {
  nav, header, .print\\:hidden { display: none !important; }
  body { background: white !important; }
  .rounded-lg { box-shadow: none !important; border: none !important; }
}
`;

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
  const [userId, setUserId] = useState("");

  // Dropdown data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Current user for role-based scoping
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const isScoped = currentUser?.route_id != null;

  // Report results
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [grandTotal, setGrandTotal] = useState<
    Record<string, unknown> | number | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);

  // Branch item summary / itemwise-levy payment modes
  const [paymentModesData, setPaymentModesData] = useState<
    { payment_mode_name: string; amount: number }[]
  >([]);

  // PDF download
  const [downloading, setDownloading] = useState(false);

  // Thermal print
  const [printing, setPrinting] = useState(false);

  const activeReport = REPORT_TYPES[activeIndex];

  // Fetch dropdown data once on mount
  const fetchDropdowns = useCallback(async () => {
    try {
      const [branchResp, routeResp, pmResp, meResp, usersResp] = await Promise.all([
        api.get<Branch[]>(
          "/api/branches?limit=200&status=active&sort_by=name&sort_order=asc"
        ),
        api.get<Route[]>("/api/routes?limit=200&status=active"),
        api.get<PaymentMode[]>("/api/payment-modes?limit=200&status=active"),
        api.get<User>("/api/auth/me"),
        api.get<User[]>("/api/users?limit=200&status=active"),
      ]);
      setBranches(branchResp.data);
      setRoutes(routeResp.data);
      setPaymentModes(pmResp.data);
      setCurrentUser(meResp.data);
      setUsers(usersResp.data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  // Auto-lock route filter for scoped users
  useEffect(() => {
    if (isScoped && currentUser?.route_id) {
      setRouteId(String(currentUser.route_id));
    }
  }, [isScoped, currentUser?.route_id]);

  // Clear results when switching tabs
  const handleTabChange = (index: number) => {
    setActiveIndex(index);
    setRows([]);
    setGrandTotal(null);
    setPaymentModesData([]);
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
    if (config.filters.includes("user") && userId) {
      params.user_id = userId;
    }
    return params;
  }, [activeIndex, dateFrom, dateTo, singleDate, branchId, paymentModeId, routeId, userId]);

  // Generate report
  const generateReport = useCallback(async () => {
    setLoading(true);
    setError("");
    setHasGenerated(true);
    try {
      const config = REPORT_TYPES[activeIndex];
      const params = buildFilterParams();

      const response = await api.get(config.endpoint, { params });
      const data = response.data;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setGrandTotal(
          data.grand_total != null ? Number(data.grand_total) : null
        );
        // Extract payment modes for branch-item-summary and itemwise-levy
        if ((config.key === "branch-item-summary" || config.key === "itemwise-levy") && Array.isArray(data.payment_modes)) {
          setPaymentModesData(data.payment_modes);
        } else {
          setPaymentModesData([]);
        }
      } else if (Array.isArray(data)) {
        setRows(data);
        setGrandTotal(null);
        setPaymentModesData([]);
      } else {
        setRows([]);
        setGrandTotal(null);
        setPaymentModesData([]);
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

      const response = await api.get(config.pdfEndpoint, {
        params,
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

  // Print thermal receipt for branch item summary
  const handlePrint = async () => {
    setPrinting(true);
    try {
      const branchName = branchId
        ? branches.find((b) => String(b.id) === branchId)?.name || ""
        : "ALL BRANCHES";

      const { printBranchItemSummary } = await import("@/lib/print-branch-summary");
      const { getReceiptPaperWidth } = await import("@/lib/print-receipt");

      await printBranchItemSummary({
        branchName,
        dateFrom: dateFrom,
        dateTo: dateTo,
        items: rows.map((r) => ({
          item_name: String(r.item_name || ""),
          rate: Number(r.rate || 0),
          quantity: Number(r.quantity || 0),
          net: Number(r.net || 0),
        })),
        grandTotal: typeof grandTotal === "number" ? grandTotal : 0,
        paymentModes: paymentModesData,
        paperWidth: getReceiptPaperWidth(),
      });
    } catch {
      setError("Failed to print report.");
    } finally {
      setPrinting(false);
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
      {/* Print Stylesheet */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate and download reports across various categories
          </p>
        </div>
        <div className="flex gap-2">
          {activeReport.key === "branch-item-summary" && rows.length > 0 && (
            <Button
              onClick={handlePrint}
              disabled={printing}
              variant="outline"
            >
              {printing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Printer className="h-4 w-4 mr-2" />
              )}
              {printing ? "Printing..." : "Print 80mm"}
            </Button>
          )}
          {rows.length > 0 && (
            <Button
              onClick={() => window.print()}
              variant="outline"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          )}
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
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-0 scrollbar-thin print:hidden">
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
      <Card className="print:hidden">
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
                  disabled={isScoped}
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

            {/* Route Filter */}
            {activeFilters.includes("route") && (
              <div>
                <Label className="mb-1.5 block">Route</Label>
                <Select
                  value={routeId || "all"}
                  onValueChange={(v) => setRouteId(v === "all" ? "" : v)}
                  disabled={isScoped}
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

            {/* User / Billing Operator Filter */}
            {activeFilters.includes("user") && (
              <div>
                <Label className="mb-1.5 block">Billing Operator</Label>
                <Select
                  value={userId || "all"}
                  onValueChange={(v) => setUserId(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="All Operators" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Operators</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.full_name}
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
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm print:hidden">
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
            {grandTotal != null && rows.length > 0 && (
              <TableFooter>
                <TableRow className="font-semibold bg-muted/50">
                  {typeof grandTotal === "number" ? (
                    <>
                      {activeReport.columns.map((col, colIdx) => (
                        <TableCell
                          key={col.key}
                          className={`${col.align === "right" ? "text-right" : "text-left"} font-semibold`}
                        >
                          {colIdx === 0
                            ? "Grand Total"
                            : colIdx === activeReport.columns.length - 1
                              ? formatCurrency(grandTotal)
                              : ""}
                        </TableCell>
                      ))}
                    </>
                  ) : (
                    activeReport.columns.map((col, colIdx) => (
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
                    ))
                  )}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </div>

      {/* Payment Mode Breakdown (branch-item-summary and itemwise-levy) */}
      {(activeReport.key === "branch-item-summary" || activeReport.key === "itemwise-levy") && paymentModesData.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-3">Payment Mode Breakdown</h3>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Payment Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentModesData.map((pm, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{pm.payment_mode_name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(pm.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Row count footer */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground print:hidden">
          <span>
            Showing {rows.length} {rows.length === 1 ? "row" : "rows"}
          </span>
        </div>
      )}
    </div>
  );
}
