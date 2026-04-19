"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface ItemLine {
  ticket_item_id: number;
  item_id: number;
  item_name: string;
  rate: number;
  levy: number;
  quantity: number;
  line_value: number;
}

interface TicketView {
  ticket_id: number;
  branch_id: number;
  original_amount: number;
  original_items: ItemLine[];
  items_to_remove: ItemLine[];
  final_items: ItemLine[];
  final_amount: number;
}

interface Plan {
  applied: number;
  tickets: TicketView[];
  item_ids: number[];
}

export interface DryRunResult {
  batch_id: string;
  cash_total_before: number;
  requested_adjustment: number;
  recommended_adjustment: number;
  max_possible_adjustment: number;
  recommended_plan: Plan;
  requested_plan: Plan;
  diff_items: number[];
}

interface Props {
  result: DryRunResult;
  branchName: string;
  onCancel: () => void;
  onCommitted: () => void;
}

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DryRunPreview({ result, branchName, onCancel, onCommitted }: Props) {
  const [activePlan, setActivePlan] = useState<"recommended" | "requested">("recommended");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const plan = activePlan === "recommended" ? result.recommended_plan : result.requested_plan;
  const diffSet = new Set(result.diff_items);
  const cashAfter = result.cash_total_before - plan.applied;
  const targetAmount = activePlan === "recommended" ? result.recommended_adjustment : result.requested_adjustment;
  const notApplied = Math.max(0, targetAmount - plan.applied);

  const handleCommit = async (choice: "recommended" | "requested") => {
    setLoading(true);
    setError("");
    try {
      await api.post("/api/admin/d-drive/adjustment/commit", {
        batch_id: result.batch_id,
        plan_choice: choice,
      });
      onCommitted();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Commit failed");
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="!max-w-[95vw] w-[95vw] !max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Trial Preview — {branchName}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 border-b grid grid-cols-7 gap-3">
          {[
            { label: "Cash Before", value: fmt(result.cash_total_before) },
            { label: "Requested", value: fmt(result.requested_adjustment) },
            { label: "Recommended", value: fmt(result.recommended_adjustment), accent: "text-emerald-600 dark:text-emerald-400" },
            { label: "Max Possible", value: fmt(result.max_possible_adjustment) },
            { label: "Actual Applied", value: fmt(plan.applied), accent: "text-destructive" },
            { label: "Cash After", value: fmt(cashAfter), accent: "text-primary" },
            { label: "Items Removed", value: String(plan.item_ids.length) },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-muted/50 rounded p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`font-bold text-sm mt-0.5 ${accent ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-b flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium mr-2">View plan:</span>
          <button
            onClick={() => setActivePlan("recommended")}
            className={`px-4 py-1.5 rounded text-sm font-medium border ${activePlan === "recommended" ? "bg-emerald-600 text-white border-emerald-600" : "bg-card border-border"}`}
          >
            Recommended ({fmt(result.recommended_plan.applied)})
          </button>
          <button
            onClick={() => setActivePlan("requested")}
            className={`px-4 py-1.5 rounded text-sm font-medium border ${activePlan === "requested" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            Requested ({fmt(result.requested_plan.applied)})
          </button>
          {activePlan === "requested" && result.diff_items.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 ml-3">
              Custom amount removes {result.diff_items.length} additional items (highlighted below)
            </p>
          )}
          {notApplied > 0.01 && (
            <p className="text-xs text-muted-foreground ml-auto">
              {fmt(notApplied)} could not be applied (discrete item values)
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {plan.tickets.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No tickets affected.</p>
          )}
          {plan.tickets.map(t => (
            <div key={t.ticket_id} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/40 flex items-center justify-between text-sm flex-wrap gap-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-mono font-semibold text-primary">#{t.ticket_id}</span>
                  <span className="text-muted-foreground">Original: {fmt(t.original_amount)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Final: {fmt(t.final_amount)}</span>
                  <span className="text-destructive font-semibold">−{fmt(t.original_amount - t.final_amount)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.items_to_remove.length} item{t.items_to_remove.length !== 1 ? "s" : ""} removed
                </span>
              </div>
              <div className="grid grid-cols-2 divide-x">
                <div className="p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Original Items</p>
                  <ul className="space-y-0.5 text-sm">
                    {t.original_items.map(i => {
                      const toRemove = t.items_to_remove.some(r => r.ticket_item_id === i.ticket_item_id);
                      const isExtra = toRemove && diffSet.has(i.ticket_item_id);
                      return (
                        <li
                          key={i.ticket_item_id}
                          className={`flex justify-between ${toRemove ? "line-through text-destructive" : ""} ${isExtra ? "bg-amber-100 dark:bg-amber-950/40 rounded px-1" : ""}`}
                        >
                          <span>{i.quantity}× {i.item_name}</span>
                          <span className="tabular-nums">{fmt(i.line_value)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Final Items</p>
                  <ul className="space-y-0.5 text-sm">
                    {t.final_items.length === 0 ? (
                      <li className="text-muted-foreground italic">(empty ticket)</li>
                    ) : (
                      t.final_items.map(i => (
                        <li key={i.ticket_item_id} className="flex justify-between">
                          <span>{i.quantity}× {i.item_name}</span>
                          <span className="tabular-nums">{fmt(i.line_value)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="px-6 py-2 text-sm text-destructive border-t">{error}</p>}

        <div className="px-6 py-3 border-t flex gap-2 justify-end bg-card flex-wrap">
          <Button variant="outline" onClick={onCancel} disabled={loading}>← Back</Button>
          <Button
            onClick={() => handleCommit("recommended")}
            disabled={loading || result.recommended_plan.item_ids.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading && activePlan === "recommended" ? "Applying…" : `Confirm Recommended (${fmt(result.recommended_plan.applied)})`}
          </Button>
          <Button
            onClick={() => handleCommit("requested")}
            disabled={loading || result.requested_plan.item_ids.length === 0}
          >
            {loading && activePlan === "requested" ? "Applying…" : `Confirm Requested (${fmt(result.requested_plan.applied)})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
