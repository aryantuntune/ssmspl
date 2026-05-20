"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import api from "@/lib/api";
import FilterBar, { Filters, RouteOption, formatRouteLabel } from "./components/FilterBar";
import BranchSummaryCards from "./components/BranchSummaryCards";
import TicketTable from "./components/TicketTable";
import AdjustmentModal from "./components/AdjustmentModal";
import TransferModal from "./components/TransferModal";
import AdjustmentsHistoryModal from "./components/AdjustmentsHistoryModal";
import SyncCheckModal from "./components/SyncCheckModal";
import { Button } from "@/components/ui/button";
import { History, ShieldCheck, ArrowRightLeft } from "lucide-react";

type Mode = "reconcile" | "transfer" | null;

interface BranchSummary {
  branch_id: number;
  branch_name: string;
  ticket_count: number;
  total: number;
  cash: number;
  upi: number;
  online: number;
}

interface Ticket {
  id: number;
  ticket_date: string;
  branch_name: string;
  payment_mode: string;
  net_amount: number;
  operator_name: string;
  item_summary: string;
}

interface TicketPageData {
  tickets: Ticket[];
  total: number;
  page: number;
  total_pages: number;
}

export default function DDrivePage() {
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");
  const [mode, setMode] = useState<Mode>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [summaries, setSummaries] = useState<BranchSummary[]>([]);
  const [ticketData, setTicketData] = useState<TicketPageData>({
    tickets: [], total: 0, page: 1, total_pages: 1,
  });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [reconcileTarget, setReconcileTarget] = useState<{
    branchId: number; branchName: string; cashTotal: number;
  } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{
    routeId: number; routeLabel: string;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncCheckOpen, setSyncCheckOpen] = useState(false);

  useEffect(() => {
    api.get("/api/branches", { params: { limit: 200, status: "active" } })
      .then(r => setBranches(r.data?.branches ?? r.data ?? [])).catch(() => {});
    api.get("/api/routes", { params: { limit: 200, status: "active" } })
      .then(r => setRoutes(r.data?.routes ?? r.data ?? [])).catch(() => {});
  }, []);

  const selectedRoute = useMemo<RouteOption | null>(() => {
    if (!filters || filters.scopeMode !== "route" || filters.routeId === "all") return null;
    return routes.find(r => String(r.id) === filters.routeId) ?? null;
  }, [filters, routes]);

  const buildParams = useCallback((f: Filters, page = 1) => {
    const p: Record<string, string> = { date_start: f.dateStart, date_end: f.dateEnd };
    if (f.scopeMode === "branch" && f.branchId !== "all") p.branch_id = f.branchId;
    if (page > 1) p.page = String(page);
    return p;
  }, []);

  const loadData = useCallback(async (f: Filters, page = 1) => {
    const params = buildParams(f, page);
    setSummaryLoading(true);
    setTicketsLoading(true);
    api.get("/api/admin/d-drive/summary", { params })
      .then(r => {
        let data: BranchSummary[] = r.data ?? [];
        if (f.scopeMode === "route" && f.routeId !== "all") {
          const route = routes.find(rt => String(rt.id) === f.routeId);
          if (route) {
            const ids = new Set([route.branch_id_one, route.branch_id_two]);
            data = data.filter(s => ids.has(s.branch_id));
          }
        }
        setSummaries(data);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
    api.get("/api/admin/d-drive/tickets", { params })
      .then(r => {
        let payload: TicketPageData = r.data;
        if (f.scopeMode === "route" && f.routeId !== "all" && payload?.tickets) {
          const route = routes.find(rt => String(rt.id) === f.routeId);
          if (route) {
            const branchNames = new Set(
              [route.branch_one_name, route.branch_two_name].filter(Boolean) as string[]
            );
            const filtered = payload.tickets.filter(t => branchNames.has(t.branch_name));
            payload = { ...payload, tickets: filtered, total: filtered.length };
          }
        }
        setTicketData(payload);
      })
      .catch(() => {})
      .finally(() => setTicketsLoading(false));
  }, [buildParams, routes]);

  const handleApply = (f: Filters) => {
    setFilters(f);
    loadData(f);
  };

  const handleModeChange = (newMode: Mode) => {
    if (mode === newMode) return;
    setMode(newMode);
    setFilters(null);
    setSummaries([]);
    setTicketData({ tickets: [], total: 0, page: 1, total_pages: 1 });
  };

  const subtitle = mode === "reconcile"
    ? "Branch-wise reconciliation"
    : mode === "transfer"
      ? "Route-scoped item transfer"
      : "Choose an action below";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">D Drive</h1>
          <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSyncCheckOpen(true)}>
            <ShieldCheck className="w-4 h-4 mr-1.5" /> Sync Check
          </Button>
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="w-4 h-4 mr-1.5" /> Adjustments History
          </Button>
        </div>
      </div>

      {/* Step 1 — Payment mode. Chosen FIRST, before the action. */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step 1 · Payment Mode
        </p>
        <div className="inline-flex rounded-lg border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setPaymentMode("CASH")}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              paymentMode === "CASH"
                ? "bg-emerald-600 text-white shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Cash
          </button>
          <button
            type="button"
            onClick={() => setPaymentMode("UPI")}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              paymentMode === "UPI"
                ? "bg-blue-600 text-white shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            UPI
          </button>
        </div>
      </div>

      {/* Step 2 — Action. Reconciliation or Transfer, applied to the mode chosen above. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground -mb-3">
        Step 2 · Action ({paymentMode})
      </p>
      <div className="inline-flex rounded-lg border bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => handleModeChange("reconcile")}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === "reconcile"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Reconciliation
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("transfer")}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === "transfer"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Transfer
        </button>
      </div>

      {/* Empty state */}
      {mode === null && (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          Select <strong>Reconciliation</strong> or <strong>Transfer</strong> above to begin.
        </div>
      )}

      {/* Filter bar — only after mode is chosen */}
      {mode && (
        <FilterBar
          mode={mode}
          branches={branches}
          routes={routes}
          onApply={handleApply}
        />
      )}

      {/* Reconcile mode results */}
      {mode === "reconcile" && filters && (
        <>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Branch Summary
            </h2>
            <BranchSummaryCards
              summaries={summaries}
              loading={summaryLoading}
              showTransferButton={false}
              paymentMode={paymentMode}
              onReconcile={(branchId, branchName, cashTotal) =>
                setReconcileTarget({ branchId, branchName, cashTotal })
              }
              onTransfer={() => {}}
            />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Tickets
            </h2>
            <TicketTable
              tickets={ticketData.tickets}
              total={ticketData.total}
              page={ticketData.page}
              totalPages={ticketData.total_pages}
              loading={ticketsLoading}
              onPageChange={p => loadData(filters, p)}
            />
          </div>
        </>
      )}

      {/* Transfer mode results */}
      {mode === "transfer" && filters && selectedRoute && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card border rounded-lg">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected Route
              </p>
              <p className="text-base font-semibold mt-0.5">
                {formatRouteLabel(selectedRoute)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tickets from both branches participate in this transfer.
              </p>
            </div>
            <Button
              onClick={() =>
                setTransferTarget({
                  routeId: selectedRoute.id,
                  routeLabel: formatRouteLabel(selectedRoute),
                })
              }
            >
              <ArrowRightLeft className="w-4 h-4 mr-1.5" /> Transfer Items
            </Button>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Branches on this Route
            </h2>
            <BranchSummaryCards
              summaries={summaries}
              loading={summaryLoading}
              showTransferButton={false}
              paymentMode={paymentMode}
              onReconcile={() => {}}
              onTransfer={() => {}}
            />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Tickets
            </h2>
            <TicketTable
              tickets={ticketData.tickets}
              total={ticketData.total}
              page={ticketData.page}
              totalPages={ticketData.total_pages}
              loading={ticketsLoading}
              onPageChange={p => loadData(filters, p)}
            />
          </div>
        </>
      )}

      {reconcileTarget && filters && (
        <AdjustmentModal
          open={true}
          branchId={reconcileTarget.branchId}
          branchName={reconcileTarget.branchName}
          cashTotal={reconcileTarget.cashTotal}
          paymentMode={paymentMode}
          dateStart={filters.dateStart}
          dateEnd={filters.dateEnd}
          onClose={() => setReconcileTarget(null)}
          onCommitted={() => { setReconcileTarget(null); loadData(filters); }}
        />
      )}

      {transferTarget && filters && (
        <TransferModal
          open={true}
          mode="route"
          routeId={transferTarget.routeId}
          routeLabel={transferTarget.routeLabel}
          paymentMode={paymentMode}
          dateStart={filters.dateStart}
          dateEnd={filters.dateEnd}
          onClose={() => setTransferTarget(null)}
          onCommitted={() => { setTransferTarget(null); loadData(filters); }}
        />
      )}

      <AdjustmentsHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRolledBack={() => filters && loadData(filters)}
        branches={branches}
      />

      <SyncCheckModal
        open={syncCheckOpen}
        onClose={() => setSyncCheckOpen(false)}
        branches={branches}
        defaultDateStart={filters?.dateStart ?? new Date().toISOString().slice(0, 10)}
        defaultDateEnd={filters?.dateEnd ?? new Date().toISOString().slice(0, 10)}
        defaultBranchId={filters?.branchId ?? "all"}
      />
    </div>
  );
}
