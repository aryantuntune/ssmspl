"use client";
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import api from "@/lib/api";

interface ItemLine {
  ticket_item_id: number;
  item_id: number;
  item_name: string;
  unit_value: number;
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

interface ClosestPlan extends Plan {
  extra_item_id: number | null;
}

export interface DryRunResult {
  batch_id: string;
  cash_total_before: number;
  requested_adjustment: number;
  achievable_adjustment: number;
  recommended_adjustment: number;
  unapplied_amount: number;
  recommended_plan: Plan;
  requested_plan: Plan;
  closest_plan: ClosestPlan;
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
  const [activePlan, setActivePlan] = useState<"recommended" | "requested" | "closest">("recommended");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [skippedTickets, setSkippedTickets] = useState<Set<number>>(new Set());

  const plan = activePlan === "recommended"
    ? result.recommended_plan
    : activePlan === "requested"
    ? result.requested_plan
    : result.closest_plan;
  const effective = useMemo(() => {
    let applied = 0;
    let itemsRemoved = 0;
    let ticketsAffected = 0;
    for (const t of plan.tickets) {
      if (skippedTickets.has(t.ticket_id)) continue;
      applied += t.original_amount - t.final_amount;
      itemsRemoved += t.items_to_remove.length;
      ticketsAffected += 1;
    }
    return { applied, itemsRemoved, ticketsAffected };
  }, [plan, skippedTickets]);

  const cashAfter = result.cash_total_before - effective.applied;
  const emptyTicketCount = plan.tickets.filter(t => t.final_items.length === 0).length;

  const toggleSkip = (ticketId: number) => {
    setSkippedTickets(prev => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const handleCommit = async (choice: "recommended" | "requested" | "closest") => {
    setLoading(true);
    setError("");
    try {
      const targetPlan = choice === "recommended"
        ? result.recommended_plan
        : choice === "requested"
        ? result.requested_plan
        : result.closest_plan;
      const planTicketIds = new Set(targetPlan.tickets.map(t => t.ticket_id));
      const skippedForThisPlan = Array.from(skippedTickets).filter(id => planTicketIds.has(id));
      await api.post("/api/admin/d-drive/adjustment/commit", {
        batch_id: result.batch_id,
        plan_choice: choice,
        skipped_ticket_ids: skippedForThisPlan,
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

        {/* Simplified summary — 4 core metrics only */}
        <div className="px-6 py-4 border-b grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Cash Before</p>
            <p className="font-bold text-lg mt-1">{fmt(result.cash_total_before)}</p>
          </div>
          <div className="bg-muted/50 rounded p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Requested</p>
            <p className="font-bold text-lg mt-1">{fmt(result.requested_adjustment)}</p>
          </div>
          <div className="bg-destructive/10 rounded p-3 border border-destructive/20">
            <p className="text-[11px] text-destructive uppercase tracking-wide">Will Remove</p>
            <p className="font-bold text-lg mt-1 text-destructive">{fmt(effective.applied)}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded p-3 border border-emerald-200 dark:border-emerald-900">
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">Cash After</p>
            <p className="font-bold text-lg mt-1 text-emerald-700 dark:text-emerald-400">{fmt(cashAfter)}</p>
          </div>
        </div>

        {/* Plan toggle */}
        <div className="px-6 py-3 border-b flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium mr-1">Plan:</span>
          <button
            onClick={() => { setActivePlan("recommended"); setSkippedTickets(new Set()); }}
            className={`px-4 py-1.5 rounded text-sm font-medium border ${activePlan === "recommended" ? "bg-emerald-600 text-white border-emerald-600" : "bg-card border-border"}`}
          >
            Recommended ({fmt(result.recommended_plan.applied)})
          </button>
          <button
            onClick={() => { setActivePlan("requested"); setSkippedTickets(new Set()); }}
            className={`px-4 py-1.5 rounded text-sm font-medium border ${activePlan === "requested" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            Requested ({fmt(result.requested_plan.applied)})
          </button>
          <button
            onClick={() => { setActivePlan("closest"); setSkippedTickets(new Set()); }}
            className={`px-4 py-1.5 rounded text-sm font-medium border ${activePlan === "closest" ? "bg-violet-600 text-white border-violet-600" : "bg-card border-border"}`}
          >
            Closest Match ({fmt(result.closest_plan.applied)})
          </button>
        </div>

        {emptyTicketCount > 0 && (
          <div className="px-6 py-2 border-b bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200">
            <strong>{emptyTicketCount}</strong> ticket{emptyTicketCount !== 1 ? "s" : ""} will be deleted entirely.
            Use the toggle on any such ticket to keep it untouched.
          </div>
        )}

        {/* Per-ticket breakdown */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {plan.tickets.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No tickets affected.</p>
          )}
          {plan.tickets.map(t => {
            const wouldBeEmpty = t.final_items.length === 0;
            const isSkipped = skippedTickets.has(t.ticket_id);
            return (
              <div
                key={t.ticket_id}
                className={`border rounded-lg overflow-hidden ${isSkipped ? "opacity-50" : ""} ${wouldBeEmpty && !isSkipped ? "border-destructive/60" : ""}`}
              >
                <div className="px-4 py-2 bg-muted/40 flex items-center justify-between text-sm flex-wrap gap-2">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-mono font-semibold text-primary">#{t.ticket_id}</span>
                    <span className="text-muted-foreground">Original: {fmt(t.original_amount)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={`font-semibold ${isSkipped ? "" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {isSkipped ? `Kept: ${fmt(t.original_amount)}` : `Final: ${fmt(t.final_amount)}`}
                    </span>
                    {!isSkipped && (
                      <span className="text-destructive font-semibold">−{fmt(t.original_amount - t.final_amount)}</span>
                    )}
                    {wouldBeEmpty && !isSkipped && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive text-destructive-foreground uppercase">
                        Will be deleted
                      </span>
                    )}
                    {isSkipped && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground uppercase">
                        Skipped
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {wouldBeEmpty && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs">Delete entirely</span>
                        <Switch
                          checked={!isSkipped}
                          onCheckedChange={() => toggleSkip(t.ticket_id)}
                        />
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {t.items_to_remove.length} item{t.items_to_remove.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x">
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Original Items</p>
                    <ul className="space-y-0.5 text-sm">
                      {t.original_items.map(i => {
                        const toRemove = t.items_to_remove.some(r => r.ticket_item_id === i.ticket_item_id);
                        const isClosestExtra = activePlan === "closest" && toRemove && result.closest_plan.extra_item_id === i.ticket_item_id;
                        const strikeThrough = toRemove && !isSkipped;
                        const highlightClass = isClosestExtra && !isSkipped ? "bg-violet-100 dark:bg-violet-950/40 rounded px-1" : "";
                        return (
                          <li
                            key={i.ticket_item_id}
                            className={`flex justify-between ${strikeThrough ? "line-through text-destructive" : ""} ${highlightClass}`}
                          >
                            <span>{i.quantity}× {i.item_name}</span>
                            <span className="tabular-nums">{fmt(i.line_value)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                      {isSkipped ? "Unchanged Items" : "Final Items"}
                    </p>
                    <ul className="space-y-0.5 text-sm">
                      {isSkipped ? (
                        t.original_items.map(i => (
                          <li key={i.ticket_item_id} className="flex justify-between">
                            <span>{i.quantity}× {i.item_name}</span>
                            <span className="tabular-nums">{fmt(i.line_value)}</span>
                          </li>
                        ))
                      ) : t.final_items.length === 0 ? (
                        <li className="text-destructive italic">(ticket will be deleted)</li>
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
            );
          })}
        </div>

        {error && <p className="px-6 py-2 text-sm text-destructive border-t">{error}</p>}

        <div className="px-6 py-3 border-t flex gap-2 justify-end bg-card flex-wrap items-center">
          <Button variant="outline" onClick={onCancel} disabled={loading}>← Back</Button>
          <Button
            onClick={() => handleCommit(activePlan)}
            disabled={loading || effective.ticketsAffected === 0}
            className={
              activePlan === "recommended" ? "bg-emerald-600 hover:bg-emerald-700 text-white" :
              activePlan === "closest" ? "bg-violet-600 hover:bg-violet-700 text-white" :
              ""
            }
          >
            {loading ? "Applying…" : `Confirm & Apply (${fmt(effective.applied)})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
