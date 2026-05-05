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

type TransferTarget =
  | { mode: "branch"; branchId: number; branchName: string }
  | { mode: "route"; routeId: number; routeLabel: string };

export default function DDrivePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState<Filters>({
    dateStart: today,
    dateEnd: today,
    scopeMode: "branch",
    branchId: "all",
    routeId: "all",
    paymentMode: "all",
    itemId: "all",
  });
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
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
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncCheckOpen, setSyncCheckOpen] = useState(false);

  useEffect(() => {
    api.get("/api/branches", { params: { limit: 200, status: "active" } })
      .then(r => setBranches(r.data?.branches ?? r.data ?? [])).catch(() => {});
    api.get("/api/items", { params: { limit: 200, status: "all" } })
      .then(r => setItems(r.data?.items ?? r.data ?? [])).catch(() => {});
    api.get("/api/routes", { params: { limit: 200, status: "active" } })
      .then(r => setRoutes(r.data?.routes ?? r.data ?? [])).catch(() => {});
  }, []);

  const selectedRoute = useMemo<RouteOption | null>(() => {
    if (filters.scopeMode !== "route" || filters.routeId === "all") return null;
    return routes.find(r => String(r.id) === filters.routeId) ?? null;
  }, [filters.scopeMode, filters.routeId, routes]);

  const buildParams = (f: Filters, page = 1) => {
    const p: Record<string, string> = { date_start: f.dateStart, date_end: f.dateEnd };
    // Scope filter: in branch mode pass branch_id; in route mode pass both
    // endpoint branches via comma-separated branch_id (the existing summary &
    // tickets endpoints accept a single value, so for route mode we omit the
    // branch filter entirely and instead rely on the front-end card layout to
    // surface only the two participating branches if a specific route is chosen).
    if (f.scopeMode === "branch") {
      if (f.branchId !== "all") p.branch_id = f.branchId;
    }
    if (f.paymentMode !== "all") p.payment_mode = f.paymentMode;
    if (f.itemId !== "all") p.item_id = f.itemId;
    if (page > 1) p.page = String(page);
    return p;
  };

  const loadData = useCallback(async (f: Filters, page = 1) => {
    const params = buildParams(f, page);
    setSummaryLoading(true);
    setTicketsLoading(true);
    api.get("/api/admin/d-drive/summary", { params })
      .then(r => {
        let data: BranchSummary[] = r.data ?? [];
        // Route mode + specific route: client-side filter to the two endpoint
        // branches only (the /summary endpoint doesn't accept multi-branch).
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
  }, [routes]);

  const handleApply = (f: Filters) => { setFilters(f); loadData(f); };

  useEffect(() => { loadData(filters); }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">D Drive</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Branch-wise ticket collection and reconciliation
          </p>
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

      <FilterBar branches={branches} items={items} routes={routes} onApply={handleApply} />

      {filters.scopeMode === "route" && selectedRoute && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Route-Scoped Mode
            </p>
            <p className="text-sm mt-0.5">
              Transfer will operate across <strong>{formatRouteLabel(selectedRoute)}</strong> —
              tickets from BOTH branches participate.
            </p>
          </div>
          <Button
            onClick={() =>
              setTransferTarget({
                mode: "route",
                routeId: selectedRoute.id,
                routeLabel: formatRouteLabel(selectedRoute),
              })
            }
          >
            <ArrowRightLeft className="w-4 h-4 mr-1.5" /> Transfer (Route-Scoped)
          </Button>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Branch Summary
        </h2>
        <BranchSummaryCards
          summaries={summaries}
          loading={summaryLoading}
          showTransferButton={filters.scopeMode === "branch"}
          onReconcile={(branchId, branchName, cashTotal) =>
            setReconcileTarget({ branchId, branchName, cashTotal })
          }
          onTransfer={(branchId, branchName) =>
            setTransferTarget({ mode: "branch", branchId, branchName })
          }
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

      {reconcileTarget && (
        <AdjustmentModal
          open={true}
          branchId={reconcileTarget.branchId}
          branchName={reconcileTarget.branchName}
          cashTotal={reconcileTarget.cashTotal}
          dateStart={filters.dateStart}
          dateEnd={filters.dateEnd}
          onClose={() => setReconcileTarget(null)}
          onCommitted={() => { setReconcileTarget(null); loadData(filters); }}
        />
      )}

      {transferTarget && transferTarget.mode === "branch" && (
        <TransferModal
          open={true}
          mode="branch"
          branchId={transferTarget.branchId}
          branchName={transferTarget.branchName}
          dateStart={filters.dateStart}
          dateEnd={filters.dateEnd}
          onClose={() => setTransferTarget(null)}
          onCommitted={() => { setTransferTarget(null); loadData(filters); }}
        />
      )}
      {transferTarget && transferTarget.mode === "route" && (
        <TransferModal
          open={true}
          mode="route"
          routeId={transferTarget.routeId}
          routeLabel={transferTarget.routeLabel}
          dateStart={filters.dateStart}
          dateEnd={filters.dateEnd}
          onClose={() => setTransferTarget(null)}
          onCommitted={() => { setTransferTarget(null); loadData(filters); }}
        />
      )}

      <AdjustmentsHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRolledBack={() => loadData(filters)}
        branches={branches}
      />

      <SyncCheckModal
        open={syncCheckOpen}
        onClose={() => setSyncCheckOpen(false)}
        branches={branches}
        defaultDateStart={filters.dateStart}
        defaultDateEnd={filters.dateEnd}
        defaultBranchId={filters.branchId}
      />
    </div>
  );
}
