"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import FilterBar, { Filters } from "./components/FilterBar";
import BranchSummaryCards from "./components/BranchSummaryCards";
import TicketTable from "./components/TicketTable";
import AdjustmentModal from "./components/AdjustmentModal";

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
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState<Filters>({
    dateStart: today, dateEnd: today, branchId: "all", paymentMode: "all", itemId: "all",
  });
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  const [summaries, setSummaries] = useState<BranchSummary[]>([]);
  const [ticketData, setTicketData] = useState<TicketPageData>({
    tickets: [], total: 0, page: 1, total_pages: 1,
  });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [reconcileTarget, setReconcileTarget] = useState<{
    branchId: number; branchName: string; cashTotal: number;
  } | null>(null);

  useEffect(() => {
    api.get("/api/branches").then(r => setBranches(r.data?.branches ?? r.data ?? [])).catch(() => {});
    api.get("/api/items").then(r => setItems(r.data?.items ?? r.data ?? [])).catch(() => {});
  }, []);

  const buildParams = (f: Filters, page = 1) => {
    const p: Record<string, string> = { date_start: f.dateStart, date_end: f.dateEnd };
    if (f.branchId !== "all") p.branch_id = f.branchId;
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
      .then(r => setSummaries(r.data))
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
    api.get("/api/admin/d-drive/tickets", { params })
      .then(r => setTicketData(r.data))
      .catch(() => {})
      .finally(() => setTicketsLoading(false));
  }, []);

  const handleApply = (f: Filters) => { setFilters(f); loadData(f); };

  useEffect(() => { loadData(filters); }, [loadData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">D Drive</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Branch-wise ticket collection and reconciliation
        </p>
      </div>

      <FilterBar branches={branches} items={items} onApply={handleApply} />

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Branch Summary
        </h2>
        <BranchSummaryCards
          summaries={summaries}
          loading={summaryLoading}
          onReconcile={(branchId, branchName, cashTotal) =>
            setReconcileTarget({ branchId, branchName, cashTotal })
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
    </div>
  );
}
