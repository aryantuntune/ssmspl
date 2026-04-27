"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

import api from "@/lib/api";
import { Route } from "@/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import ItemwiseLevyReport from "./components/ItemwiseLevyReport";
import DateBranchSummaryReport from "./components/DateBranchSummaryReport";
import ItemwiseDailyChargesReport from "./components/ItemwiseDailyChargesReport";

// ── Types mirroring the backend Pydantic models ──

export interface ItemwiseLevyRow {
  item_id: number;
  item_name: string;
  levy: string;
  branch_quantities: Record<string, number>;
  total_quantity: number;
  amount: string;
}

export interface DriftedTicket {
  ticket_id: number;
  ticket_no: number;
  ticket_amount: string;
  items_sum: string;
  diff: string;
}

export interface IntegrityWarning {
  items_total: string;
  tickets_total: string;
  diff: string;
  message: string;
  sample_tickets: DriftedTicket[];
}

export interface ItemwiseLevyData {
  route_id: number;
  route_label: string;
  date_from: string;
  date_to: string;
  branches: { id: number; name: string }[];
  rows: ItemwiseLevyRow[];
  branch_totals: Record<string, string>;
  grand_total: string;
  integrity_warning?: IntegrityWarning | null;
}

export interface DateBranchColumn {
  key: string;
  label: string;
  branch_id: number;
  mode: string;
}

export interface DateBranchRow {
  date: string;
  cells: Record<string, string>;
  total: string;
}

export interface DateBranchData {
  route_id: number;
  route_label: string;
  date_from: string;
  date_to: string;
  columns: DateBranchColumn[];
  rows: DateBranchRow[];
  column_totals: Record<string, string>;
  grand_total: string;
  integrity_warning?: IntegrityWarning | null;
}

export interface DailyChargeRow {
  item_id: number;
  item_name: string;
  charges: string;
  quantity: number;
  amount: string;
}

export interface DailyBranchSection {
  branch_id: number;
  branch_name: string;
  rows: DailyChargeRow[];
  subtotal: string;
}

export interface DailyDateSection {
  date: string;
  branches: DailyBranchSection[];
  day_total: string;
}

export interface DailyChargesData {
  route_id: number;
  route_label: string;
  date_from: string;
  date_to: string;
  dates: DailyDateSection[];
  grand_total: string;
  integrity_warning?: IntegrityWarning | null;
}

export interface MonthBranchRow {
  month: string;
  month_label: string;
  cells: Record<string, string>;
  total: string;
}

export interface MonthBranchData {
  route_label: string;
  date_from: string;
  date_to: string;
  branches: { id: number; name: string }[];
  columns: DateBranchColumn[];
  rows: MonthBranchRow[];
  column_totals: Record<string, string>;
  grand_total: string;
  integrity_warning?: IntegrityWarning | null;
}

// ── Config ──

type TabKey = "itemwise-levy" | "date-branch" | "daily-charges" | "month-branch";

interface ReportConfig {
  key: TabKey;
  label: string;
  endpoint: string;
  pdf: string;
  xlsx: string;
  // route-based reports take a single route_id; month-branch is cross-route
  // and takes an optional branch_ids list instead.
  filterMode: "route" | "branches";
}

const REPORTS: ReportConfig[] = [
  {
    key: "itemwise-levy",
    label: "Itemwise Levy Summary",
    endpoint: "/api/reports/admin/itemwise-levy-summary",
    pdf: "/api/reports/admin/itemwise-levy-summary/pdf",
    xlsx: "/api/reports/admin/itemwise-levy-summary/xlsx",
    filterMode: "route",
  },
  {
    key: "date-branch",
    label: "Date-Wise Branch Summary (Cash + GPay)",
    endpoint: "/api/reports/admin/date-branch-summary",
    pdf: "/api/reports/admin/date-branch-summary/pdf",
    xlsx: "/api/reports/admin/date-branch-summary/xlsx",
    filterMode: "route",
  },
  {
    key: "daily-charges",
    label: "Itemwise Daily Collection Charges Summary",
    endpoint: "/api/reports/admin/itemwise-daily-charges",
    pdf: "/api/reports/admin/itemwise-daily-charges/pdf",
    xlsx: "/api/reports/admin/itemwise-daily-charges/xlsx",
    filterMode: "route",
  },
  {
    key: "month-branch",
    label: "Month-Wise Branch Summary (Cash + GPay)",
    endpoint: "/api/reports/admin/month-branch-summary",
    pdf: "/api/reports/admin/month-branch-summary/pdf",
    xlsx: "/api/reports/admin/month-branch-summary/xlsx",
    filterMode: "branches",
  },
];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function routeLabel(r: Route): string {
  return r.branch_one_name && r.branch_two_name
    ? `${r.branch_one_name} + ${r.branch_two_name}`
    : `Route ${r.id}`;
}

// ── Page ──

interface BranchRef { id: number; name: string }

export default function AdminReportsPage() {
  const [tab, setTab] = useState<TabKey>("itemwise-levy");
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [routeId, setRouteId] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [branches, setBranches] = useState<BranchRef[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<
    ItemwiseLevyData | DateBranchData | DailyChargesData | MonthBranchData | null
  >(null);
  const [generated, setGenerated] = useState(false);

  const current = useMemo(() => REPORTS.find((r) => r.key === tab)!, [tab]);

  const loadRoutes = useCallback(async () => {
    try {
      const res = await api.get<Route[]>("/api/routes?limit=200&status=active");
      setRoutes(res.data);
    } catch {
      // silently ignore; user will see the empty route dropdown
    }
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      const res = await api.get<BranchRef[]>("/api/branches?limit=200&status=active&sort_by=name&sort_order=asc");
      setBranches(res.data);
      // Default: all branches selected so the report has data even before
      // the user touches the filter.
      setSelectedBranchIds(res.data.map((b) => b.id));
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    loadRoutes();
    loadBranches();
  }, [loadRoutes, loadBranches]);

  const buildParams = useCallback(() => {
    if (current.filterMode === "branches") {
      return {
        date_from: dateFrom,
        date_to: dateTo,
        // axios serialises arrays as repeated params (branch_ids=1&branch_ids=2…)
        branch_ids: selectedBranchIds.length ? selectedBranchIds : undefined,
      };
    }
    return { date_from: dateFrom, date_to: dateTo, route_id: Number(routeId) };
  }, [current.filterMode, dateFrom, dateTo, routeId, selectedBranchIds]);

  const runReport = async () => {
    if (current.filterMode === "route" && !routeId) {
      setError("Please select a route.");
      return;
    }
    if (current.filterMode === "branches" && selectedBranchIds.length === 0) {
      setError("Please select at least one branch.");
      return;
    }
    setError("");
    setLoading(true);
    setGenerated(false);
    try {
      const res = await api.get(current.endpoint, { params: buildParams() });
      setData(res.data);
      setGenerated(true);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to load report.";
      setError(detail);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const download = async (kind: "pdf" | "xlsx") => {
    if (current.filterMode === "route" && !routeId) {
      setError("Please select a route.");
      return;
    }
    if (current.filterMode === "branches" && selectedBranchIds.length === 0) {
      setError("Please select at least one branch.");
      return;
    }
    setError("");
    const endpoint = kind === "pdf" ? current.pdf : current.xlsx;
    const setter = kind === "pdf" ? setDownloading : setDownloadingXlsx;
    setter(true);
    try {
      const res = await api.get(endpoint, {
        params: buildParams(),
        responseType: "blob",
      });
      // Prefer the human-readable filename the server sends via
      // Content-Disposition (e.g. Itemwise-Levy_VIRAR-SAFALE_01-Apr-2026_to_25-Apr-2026.pdf).
      // Fall back to a basic name if the header isn't readable (e.g. CORS).
      const cd = (res.headers as Record<string, string | undefined>)["content-disposition"] || "";
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const serverName = match ? decodeURIComponent(match[1]) : "";
      const a = document.createElement("a");
      const url = window.URL.createObjectURL(new Blob([res.data]));
      a.href = url;
      a.download = serverName || `${current.key}_${dateFrom}_${dateTo}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        `Failed to download ${kind.toUpperCase()}.`;
      setError(detail);
    } finally {
      setter(false);
    }
  };

  // Reset data when switching tabs
  useEffect(() => {
    setData(null);
    setGenerated(false);
    setError("");
  }, [tab]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Admin Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Statutory POS reports. All values reflect the current database state.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="grid grid-cols-4">
          {REPORTS.map((r) => (
            <TabsTrigger key={r.key} value={r.key}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="date_from">Date From</Label>
                <Input
                  id="date_from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="date_to">Date To</Label>
                <Input
                  id="date_to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              {current.filterMode === "route" ? (
                <div>
                  <Label htmlFor="route">Route</Label>
                  <Select value={routeId} onValueChange={setRouteId}>
                    <SelectTrigger id="route">
                      <SelectValue placeholder="Select route" />
                    </SelectTrigger>
                    <SelectContent>
                      {routes.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {routeLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <BranchMultiSelect
                  branches={branches}
                  selectedIds={selectedBranchIds}
                  onChange={setSelectedBranchIds}
                />
              )}
              <div className="flex items-end gap-2">
                <Button onClick={runReport} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading
                    </>
                  ) : (
                    "Generate"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => download("pdf")}
                  disabled={downloading || !generated}
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => download("xlsx")}
                  disabled={downloadingXlsx || !generated}
                >
                  {downloadingXlsx ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                  )}
                  Excel
                </Button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600 mt-4" role="alert">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <TabsContent value="itemwise-levy" className="mt-4">
          {generated && tab === "itemwise-levy" && data && (
            <ItemwiseLevyReport data={data as ItemwiseLevyData} />
          )}
        </TabsContent>
        <TabsContent value="date-branch" className="mt-4">
          {generated && tab === "date-branch" && data && (
            <DateBranchSummaryReport data={data as DateBranchData} />
          )}
        </TabsContent>
        <TabsContent value="daily-charges" className="mt-4">
          {generated && tab === "daily-charges" && data && (
            <ItemwiseDailyChargesReport data={data as DailyChargesData} />
          )}
        </TabsContent>
        <TabsContent value="month-branch" className="mt-4">
          {generated && tab === "month-branch" && data && (
            <MonthBranchSummaryReport data={data as MonthBranchData} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Note: the backend still computes an integrity cross-check and attaches
// `integrity_warning` to the response when items/tickets diverge, and the
// adjustment engine writes to the structured log. We intentionally do not
// render it in the admin UI — it's surfaced via server logs / JSON API
// for engineers, not as an end-user banner.


// ── Branch multi-select (popover-style) ──────────────────────────────────────

function BranchMultiSelect({
  branches,
  selectedIds,
  onChange,
}: {
  branches: BranchRef[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click and Escape — matches the rest of the dashboard
  // popovers and unblocks keyboard-only users.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const allSelected = selectedIds.length === branches.length && branches.length > 0;
  const summary = allSelected
    ? `All ${branches.length} branches`
    : selectedIds.length === 0
      ? "Select branches"
      : selectedIds.length === 1
        ? branches.find((b) => b.id === selectedIds[0])?.name ?? "1 branch"
        : `${selectedIds.length} branches`;

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <Label htmlFor="branches">Branches</Label>
      <button
        id="branches"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full mt-2 flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent"
      >
        <span className="truncate text-left">{summary}</span>
        <span className="ml-2 opacity-50">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-md">
          <button
            type="button"
            onClick={() =>
              onChange(allSelected ? [] : branches.map((b) => b.id))
            }
            className="w-full px-3 py-2 text-left text-sm font-medium hover:bg-accent border-b"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          {branches.map((b) => (
            <label
              key={b.id}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(b.id)}
                onChange={() => toggle(b.id)}
                className="rounded"
              />
              <span>{b.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Month-Wise Branch Summary preview ────────────────────────────────────────

function MonthBranchSummaryReport({ data }: { data: MonthBranchData }) {
  function fmt(v: string | number): string {
    const n = typeof v === "string" ? Number(v) : v;
    if (Number.isNaN(n)) return String(v);
    return n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  const hasData = data.rows.some((r) =>
    Object.values(r.cells).some((v) => Number(v) > 0)
  );
  return (
    <div className="rounded-md border bg-card p-6">
      <div className="text-center mb-4">
        <h2 className="text-base font-bold">
          SUVARNADURGA SHIPPING &amp; MARINE SERVICES PVT.LTD.
        </h2>
        <p className="text-sm font-semibold">{data.route_label}</p>
        <p className="text-xs text-gray-600">
          Month-Wise Branch Summary — Cash &amp; GPay
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2">
              <th className="text-left p-2">Month</th>
              {data.columns.map((c) => (
                <th key={c.key} className="text-right p-2 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="text-right p-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {!hasData ? (
              <tr>
                <td
                  colSpan={2 + data.columns.length}
                  className="text-center text-gray-500 p-4"
                >
                  No data for the selected range.
                </td>
              </tr>
            ) : (
              data.rows.map((r) => (
                <tr key={r.month} className="border-b">
                  <td className="p-2">{r.month_label}</td>
                  {data.columns.map((c) => {
                    const v = Number(r.cells[c.key] ?? 0);
                    return (
                      <td key={c.key} className="text-right p-2 whitespace-nowrap">
                        {v > 0 ? `₹${fmt(v)}` : ""}
                      </td>
                    );
                  })}
                  <td className="text-right p-2 font-semibold whitespace-nowrap">
                    ₹{fmt(r.total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold border-t-2">
              <td className="p-2">Total</td>
              {data.columns.map((c) => (
                <td key={c.key} className="text-right p-2 whitespace-nowrap">
                  ₹{fmt(data.column_totals[c.key] ?? "0")}
                </td>
              ))}
              <td className="text-right p-2">₹{fmt(data.grand_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
