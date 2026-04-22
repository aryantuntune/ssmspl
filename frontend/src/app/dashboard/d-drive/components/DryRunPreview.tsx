"use client";
import { useState, useMemo, useRef } from "react";
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
  extra_item_id: number | null;
}

interface RoundoffInfo {
  ticket_id: number;
  ticket_item_id: number;
  remaining_absorbed: number;
  old: { item_id: number; item_name: string; rate: number; levy: number; quantity: number; line_value: number };
  new: { item_id: number; item_name: string; rate: number; levy: number; quantity: number; line_value: number };
}

export interface DryRunResult {
  batch_id: string;
  cash_total_before: number;
  requested_adjustment: number;
  closest_applied: number;
  total_applied: number;
  deletable_cash_total: number;
  protected_cash_total: number;
  unapplied_amount: number;
  plan: Plan;
  roundoff: RoundoffInfo | null;
}

interface Props {
  result: DryRunResult;
  branchName: string;
  onCancel: () => void;
  onCommitted: () => void;
}

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DryRunPreview({ result, branchName, onCancel, onCommitted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [skippedTickets, setSkippedTickets] = useState<Set<number>>(new Set());
  // Hard guard against double-submit: once clicked successfully, stays true until retry-on-error.
  const submittedRef = useRef(false);

  const plan = result.plan;

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
    // Include round-off absorption (always active if present; not user-toggleable)
    const roundoffAmount = result.roundoff?.remaining_absorbed ?? 0;
    return {
      applied: applied + roundoffAmount,
      itemsRemoved,
      ticketsAffected: ticketsAffected + (result.roundoff ? 1 : 0),
      roundoffAmount,
    };
  }, [plan, skippedTickets, result.roundoff]);

  const cashAfter = result.cash_total_before - effective.applied;
  const unappliedFromRequest = Math.max(0, result.requested_adjustment - effective.applied);
  const emptyTicketCount = plan.tickets.filter(t => t.final_items.length === 0).length;

  const toggleSkip = (ticketId: number) => {
    setSkippedTickets(prev => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const handleCommit = async () => {
    // Hard single-fire guard: if already loading, or already submitted once, ignore the click.
    if (loading || submittedRef.current) return;
    submittedRef.current = true;
    setLoading(true);
    setError("");
    try {
      const planTicketIds = new Set(plan.tickets.map(t => t.ticket_id));
      const skippedForThisPlan = Array.from(skippedTickets).filter(id => planTicketIds.has(id));
      await api.post("/api/admin/d-drive/adjustment/commit", {
        batch_id: result.batch_id,
        plan_choice: "closest",
        skipped_ticket_ids: skippedForThisPlan,
      });
      onCommitted();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Commit failed");
      // Only reset submittedRef on error so user can retry
      submittedRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="!max-w-[95vw] w-[95vw] !max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Trial Preview — {branchName}</DialogTitle>
        </DialogHeader>

        {/* Primary summary — 4 cards */}
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

        {/* Breakdown — where the cash is */}
        <div className="px-6 py-3 border-b grid grid-cols-2 gap-4 bg-muted/20">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-[11px] text-red-700 dark:text-red-400 uppercase tracking-wide">Deletable (unprotected items)</p>
              <p className="font-semibold text-red-700 dark:text-red-400">{fmt(result.deletable_cash_total)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {result.cash_total_before > 0
                ? `${Math.min(100, (result.deletable_cash_total / result.cash_total_before) * 100).toFixed(1)}% of cash`
                : ""}
            </p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 uppercase tracking-wide">Protected (locked items)</p>
              <p className="font-semibold text-amber-800 dark:text-amber-300">{fmt(result.protected_cash_total)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {result.cash_total_before > 0
                ? `${Math.min(100, (result.protected_cash_total / result.cash_total_before) * 100).toFixed(1)}% of cash`
                : ""}
            </p>
          </div>
        </div>

        {/* Round-off banner when system auto-adjusted a small remainder */}
        {result.roundoff && (
          <div className="px-6 py-3 border-b bg-blue-50 dark:bg-blue-950/20 text-xs text-blue-900 dark:text-blue-200">
            <p className="font-semibold mb-1">
              System auto-adjusted {fmt(result.roundoff.remaining_absorbed)} using last-ticket balancing.
            </p>
            <p>
              Ticket <strong>#{result.roundoff.ticket_id}</strong>: <strong>{result.roundoff.old.quantity}× {result.roundoff.old.item_name}</strong> (₹{result.roundoff.old.line_value.toFixed(2)})
              {" → "}
              <strong>{result.roundoff.new.quantity}× {result.roundoff.new.item_name}</strong> (₹{result.roundoff.new.line_value.toFixed(2)})
            </p>
          </div>
        )}
        {/* Reason banner when requested exceeds what's possible */}
        {unappliedFromRequest > 0.01 && !result.roundoff && (
          <div className="px-6 py-3 border-b bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-1">
              {fmt(unappliedFromRequest)} of your requested {fmt(result.requested_adjustment)} could not be applied.
            </p>
            <p className="mb-1">
              <strong>Why?</strong> Only {fmt(result.deletable_cash_total)} of deletable cash items exist in <strong>{branchName}</strong> for the selected date range.
              The remaining {fmt(result.protected_cash_total)} is in protected items (passengers, monthly passes, luggage, etc.) which cannot be deleted.
            </p>
            <p>
              <strong>To adjust more:</strong> widen the date range, or mark more items as Deletable in Parameter Master.
            </p>
          </div>
        )}

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
                        const strikeThrough = toRemove && !isSkipped;
                        return (
                          <li
                            key={i.ticket_item_id}
                            className={`flex justify-between ${strikeThrough ? "line-through text-destructive" : ""}`}
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
            onClick={handleCommit}
            disabled={loading || effective.ticketsAffected === 0}
          >
            {loading ? "Applying…" : `Confirm & Apply (${fmt(effective.applied)})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
