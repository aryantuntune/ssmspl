"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Undo2, Loader2, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";

interface Adjustment {
  batch_id: string;
  branch_id: number;
  date_range_start: string;
  date_range_end: string;
  adjustment_amount: number;
  status: "DRY_RUN" | "IN_PROGRESS" | "COMMITTED" | "FAILED" | "ROLLED_BACK";
  plan_choice: string | null;
  total_tickets_affected: number | null;
  total_items_affected: number | null;
  created_by: string | null;
  created_at: string | null;
  executed_at: string | null;
  rolled_back_at: string | null;
  rolled_back_by: string | null;
  error_message: string | null;
  operation_kind: "TRANSFER" | "DELETE" | "UNKNOWN";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onRolledBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  DRY_RUN: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  COMMITTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  ROLLED_BACK: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

const KIND_COLORS: Record<string, string> = {
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  TRANSFER: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  UNKNOWN: "bg-muted text-muted-foreground",
};

export default function AdjustmentsHistoryModal({ open, onClose, onRolledBack }: Props) {
  const user = useDashboardUser();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [items, setItems] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Adjustment | null>(null);

  const load = () => {
    setLoading(true);
    api.get<Adjustment[]>("/api/admin/d-drive/adjustments", { params: { limit: 100 } })
      .then(r => setItems(r.data))
      .catch(() => setError("Could not load adjustment history"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const handleRollback = async (adj: Adjustment) => {
    setRollingBackId(adj.batch_id);
    setError("");
    try {
      await api.post(`/api/admin/d-drive/adjustments/${adj.batch_id}/rollback`);
      setConfirmTarget(null);
      onRolledBack();
      load();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Rollback failed");
    } finally {
      setRollingBackId(null);
    }
  };

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

  if (confirmTarget) {
    return (
      <Dialog open={true} onOpenChange={v => !v && setConfirmTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirm Rollback
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>This will reverse the following adjustment:</p>
            <div className="bg-muted/50 rounded p-3 space-y-1">
              <p><strong>Batch:</strong> <code className="text-xs">{confirmTarget.batch_id}</code></p>
              <p><strong>Type:</strong> {confirmTarget.operation_kind}</p>
              <p><strong>Branch:</strong> #{confirmTarget.branch_id}</p>
              <p><strong>Dates:</strong> {confirmTarget.date_range_start} → {confirmTarget.date_range_end}</p>
              <p><strong>Tickets affected:</strong> {confirmTarget.total_tickets_affected ?? "—"}</p>
              <p><strong>Items affected:</strong> {confirmTarget.total_items_affected ?? "—"}</p>
              <p><strong>Executed:</strong> {fmtDate(confirmTarget.executed_at)}</p>
            </div>
            <p className="text-amber-700 dark:text-amber-400">
              Rolling back will restore the original ticket and ticket_item values from backup. Any changes made AFTER this adjustment on the same tickets will block the rollback.
            </p>
            {error && <p className="text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={rollingBackId !== null}>
              Cancel
            </Button>
            <Button
              onClick={() => handleRollback(confirmTarget)}
              disabled={rollingBackId !== null}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {rollingBackId ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Rolling back…</> : <><Undo2 className="w-4 h-4 mr-1" /> Confirm Rollback</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="!max-w-[90vw] w-[90vw] !max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Adjustment History</DialogTitle>
          <p className="text-xs text-muted-foreground">
            All recent reconciliation operations. SUPER_ADMIN can roll back COMMITTED batches.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">No adjustments yet.</div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-xs sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">When</th>
                  <th className="px-4 py-2.5 text-left font-medium">Type</th>
                  <th className="px-4 py-2.5 text-left font-medium">Branch</th>
                  <th className="px-4 py-2.5 text-left font-medium">Dates</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tickets</th>
                  <th className="px-4 py-2.5 text-right font-medium">Items</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(a => (
                  <tr key={a.batch_id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs">{fmtDate(a.executed_at || a.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={KIND_COLORS[a.operation_kind]}>{a.operation_kind}</Badge>
                    </td>
                    <td className="px-4 py-2.5">#{a.branch_id}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {a.date_range_start}{a.date_range_start !== a.date_range_end ? ` → ${a.date_range_end}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right">{a.total_tickets_affected ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">{a.total_items_affected ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={STATUS_COLORS[a.status]}>{a.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {isSuperAdmin && (a.status === "COMMITTED" || a.status === "FAILED") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => setConfirmTarget(a)}
                          disabled={rollingBackId !== null}
                          title={a.status === "FAILED" ? `Retry rollback (previous attempt: ${a.error_message ?? "unknown error"})` : ""}
                        >
                          <Undo2 className="w-3 h-3 mr-1" /> {a.status === "FAILED" ? "Retry Rollback" : "Rollback"}
                        </Button>
                      ) : a.status === "ROLLED_BACK" ? (
                        <span className="text-xs text-muted-foreground">Rolled back {fmtDate(a.rolled_back_at)}</span>
                      ) : a.status === "FAILED" ? (
                        <span className="text-xs text-destructive" title={a.error_message ?? ""}>Failed</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="px-6 py-2 text-sm text-destructive border-t">{error}</p>}

        <div className="px-6 py-3 border-t flex justify-end gap-2 bg-card">
          <Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
