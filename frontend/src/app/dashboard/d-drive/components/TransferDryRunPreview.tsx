"use client";
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface ItemLine {
  ticket_item_id: number | null;
  item_id: number;
  item_name: string;
  rate: number;
  levy: number;
  quantity: number;
  line_value: number;
  is_inserted?: boolean;
}

interface TicketView {
  ticket_id: number;
  ticket_date: string;
  route_id: number;
  original_items: ItemLine[];
  final_items: ItemLine[];
  original_amount: number;
  final_amount: number;
  difference: number;
  is_split: boolean;
}

interface SkippedTicket {
  ticket_id: number;
  reason: string;
  transferred_qty_not_applied: number;
  value_not_applied: number;
}

export interface TransferDryRunResult {
  batch_id: string;
  from_item_id: number;
  from_item_name: string;
  to_item_id: number;
  to_item_name: string;
  input_mode: "percentage" | "quantity";
  input_value: number;
  requested_transfer_qty: number;
  achieved_transfer_qty: number;
  unapplied_transfer_qty: number;
  total_from_qty_in_scope: number;
  total_from_value_applied: number;
  total_from_value_skipped: number;
  total_unapplied_rounding: number;
  total_q2_created: number;
  levy_before: number;
  levy_after: number;
  levy_saved: number;
  affected_tickets_count: number;
  tickets_to_split_count: number;
  skipped_tickets: SkippedTicket[];
  tickets: TicketView[];
  payment_mode?: string;
}

interface Props {
  result: TransferDryRunResult;
  branchName: string;
  onCancel: () => void;
  onCommitted: () => void;
}

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TransferDryRunPreview({ result, branchName, onCancel, onCommitted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Hard guard against double-submit: once clicked, stays true until retry-on-error.
  const submittedRef = useRef(false);

  const handleCommit = async () => {
    if (loading || submittedRef.current) return;
    submittedRef.current = true;
    setLoading(true); setError("");
    try {
      await api.post("/api/admin/d-drive/transfer/commit", { batch_id: result.batch_id });
      onCommitted();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Commit failed");
      submittedRef.current = false;  // Allow retry on error
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="!max-w-[95vw] w-[95vw] !max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>
              Transfer Trial Preview — {branchName} · {result.from_item_name} → {result.to_item_name}
            </span>
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                (result.payment_mode ?? "CASH") === "UPI"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
              }`}
            >
              Mode: {result.payment_mode ?? "CASH"}
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Quantity-preserving mode. Ticket totals stay identical (difference = 0 per ticket).
          </p>
        </DialogHeader>

        <div className="px-6 py-3 border-b grid grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: "Requested", value: `${result.requested_transfer_qty} FROM` },
            { label: "Achieved", value: `${result.achieved_transfer_qty} FROM`, accent: "text-primary" },
            { label: "Unapplied Qty", value: `${result.unapplied_transfer_qty}`, accent: result.unapplied_transfer_qty > 0 ? "text-amber-600 dark:text-amber-400" : "" },
            { label: "TO Units Created", value: `${result.total_q2_created}`, accent: "text-emerald-600 dark:text-emerald-400" },
            { label: "Levy Before", value: fmt(result.levy_before), accent: "text-blue-600 dark:text-blue-400" },
            { label: "Levy After", value: fmt(result.levy_after), accent: "text-emerald-600 dark:text-emerald-400" },
            { label: "Levy Saved", value: (result.levy_saved >= 0 ? "+" : "") + fmt(Math.abs(result.levy_saved)), accent: result.levy_saved > 0 ? "text-emerald-600 dark:text-emerald-400" : result.levy_saved < 0 ? "text-destructive" : "" },
            { label: "Tickets Affected", value: `${result.affected_tickets_count}${result.tickets_to_split_count > 0 ? ` (${result.tickets_to_split_count} split)` : ""}` },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-muted/50 rounded p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`font-bold text-sm mt-0.5 ${accent ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>

        {result.total_unapplied_rounding > 0.01 && (
          <div className="px-6 py-2 border-b bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200">
            Rounding remainder: {fmt(result.total_unapplied_rounding)} could not be precisely converted due to integer quantity constraint.
          </div>
        )}

        {result.skipped_tickets.length > 0 && (
          <div className="px-6 py-2 border-b bg-destructive/10 text-xs text-destructive">
            {result.skipped_tickets.length} ticket{result.skipped_tickets.length !== 1 ? "s" : ""} skipped:
            {result.skipped_tickets.slice(0, 5).map(s =>
              <span key={s.ticket_id} className="ml-2">
                #{s.ticket_id} ({s.reason === "would_empty" ? "would empty" : "Q2=0"}, {fmt(s.value_not_applied)} unapplied)
              </span>
            )}
            {result.skipped_tickets.length > 5 && <span className="ml-2">… +{result.skipped_tickets.length - 5} more</span>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {result.tickets.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No tickets affected.</p>
          )}
          {result.tickets.map(t => (
            <div key={t.ticket_id} className={`border rounded-lg overflow-hidden ${t.is_split ? "border-amber-400" : ""}`}>
              <div className="px-4 py-2 bg-muted/40 flex items-center justify-between text-sm flex-wrap gap-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-mono font-semibold text-primary">#{t.ticket_id}</span>
                  <span className="text-muted-foreground">Date: {t.ticket_date}</span>
                  <span className="text-muted-foreground">Route: {t.route_id}</span>
                  <span className="text-muted-foreground">Before: {fmt(t.original_amount)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold text-primary">After: {fmt(t.final_amount)}</span>
                  <span className={Math.abs(t.difference) < 0.01 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-destructive font-semibold"}>
                    Δ {fmt(t.difference)}
                  </span>
                  {t.is_split && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 uppercase">
                      Split
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x">
                <div className="p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Before</p>
                  <ul className="space-y-0.5 text-sm">
                    {t.original_items.map(i => (
                      <li key={i.ticket_item_id ?? `o-${i.item_id}`} className="flex justify-between">
                        <span>{i.quantity}× {i.item_name}<span className="text-xs text-muted-foreground"> (₹{i.rate.toFixed(2)}+{i.levy.toFixed(2)})</span></span>
                        <span className="tabular-nums">{fmt(i.line_value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">After</p>
                  <ul className="space-y-0.5 text-sm">
                    {t.final_items.map((i, idx) => (
                      <li key={i.ticket_item_id ?? `n-${idx}`} className={`flex justify-between ${i.is_inserted ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                        <span>
                          {i.quantity}× {i.item_name}<span className="text-xs text-muted-foreground"> (₹{i.rate.toFixed(2)}+{i.levy.toFixed(2)})</span>
                          {i.is_inserted && <span className="ml-2 text-[10px] font-bold uppercase">NEW</span>}
                        </span>
                        <span className="tabular-nums">{fmt(i.line_value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="px-6 py-2 text-sm text-destructive border-t">{error}</p>}

        <div className="px-6 py-3 border-t flex gap-2 justify-end bg-card flex-wrap items-center">
          <p className="text-xs text-muted-foreground mr-auto">
            Confirming will transfer <strong>{result.achieved_transfer_qty}</strong> units of {result.from_item_name} into <strong>{result.total_q2_created}</strong> units of {result.to_item_name}. Ticket totals are preserved exactly (rounding: {fmt(result.total_unapplied_rounding)}).
          </p>
          <Button variant="outline" onClick={onCancel} disabled={loading}>← Back</Button>
          <Button onClick={handleCommit} disabled={loading || result.tickets.length === 0}>
            {loading ? "Applying…" : "Confirm & Apply Transfer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
