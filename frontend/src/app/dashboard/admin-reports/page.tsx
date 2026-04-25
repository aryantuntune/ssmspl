"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

// ── Config ──

type TabKey = "itemwise-levy" | "date-branch" | "daily-charges";

const REPORTS: { key: TabKey; label: string; endpoint: string; pdf: string; xlsx: string }[] = [
  {
    key: "itemwise-levy",
    label: "Itemwise Levy Summary",
    endpoint: "/api/reports/admin/itemwise-levy-summary",
    pdf: "/api/reports/admin/itemwise-levy-summary/pdf",
    xlsx: "/api/reports/admin/itemwise-levy-summary/xlsx",
  },
  {
    key: "date-branch",
    label: "Date-Wise Branch Summary (Cash + GPay)",
    endpoint: "/api/reports/admin/date-branch-summary",
    pdf: "/api/reports/admin/date-branch-summary/pdf",
    xlsx: "/api/reports/admin/date-branch-summary/xlsx",
  },
  {
    key: "daily-charges",
    label: "Itemwise Daily Collection Charges Summary",
    endpoint: "/api/reports/admin/itemwise-daily-charges",
    pdf: "/api/reports/admin/itemwise-daily-charges/pdf",
    xlsx: "/api/reports/admin/itemwise-daily-charges/xlsx",
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

export default function AdminReportsPage() {
  const [tab, setTab] = useState<TabKey>("itemwise-levy");
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [routeId, setRouteId] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ItemwiseLevyData | DateBranchData | DailyChargesData | null>(
    null
  );
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

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const runReport = async () => {
    if (!routeId) {
      setError("Please select a route.");
      return;
    }
    setError("");
    setLoading(true);
    setGenerated(false);
    try {
      const res = await api.get(current.endpoint, {
        params: { date_from: dateFrom, date_to: dateTo, route_id: Number(routeId) },
      });
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
    if (!routeId) {
      setError("Please select a route.");
      return;
    }
    setError("");
    const endpoint = kind === "pdf" ? current.pdf : current.xlsx;
    const setter = kind === "pdf" ? setDownloading : setDownloadingXlsx;
    setter(true);
    try {
      const res = await api.get(endpoint, {
        params: { date_from: dateFrom, date_to: dateTo, route_id: Number(routeId) },
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
        <TabsList className="grid grid-cols-3">
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
      </Tabs>
    </div>
  );
}

// Note: the backend still computes an integrity cross-check and attaches
// `integrity_warning` to the response when items/tickets diverge, and the
// adjustment engine writes to the structured log. We intentionally do not
// render it in the admin UI — it's surfaced via server logs / JSON API
// for engineers, not as an end-user banner.
