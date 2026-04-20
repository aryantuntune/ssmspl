"use client";
import { useState } from "react";
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
  is_split: boolean;
}

export interface TransferDryRunResult {
  batch_id: string;
  from_item_id: number;
  from_item_name: string;
  to_item_id: number;
  to_item_name: string;
  input_mode: "percentage" | "quantity";
  input_value: number;
  transfer_quantity: number;
  total_quantity_in_scope: number;
  from_levy_total_before: number;
  to_levy_total_after: number;
  levy_difference: number;
  affected_tickets_count: number;
  tickets_to_split_count: number;
  tickets: TicketView[];
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

  const handleCommit = async () => {
    setLoading(true); setError("");
    try {
      await api.post("/api/admin/d-drive/transfer/commit", { batch_id: result.batch_id });
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
          <DialogTitle>
            Transfer Trial Preview — {branchName} · {result.from_item_name} → {result.to_item_name}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 border-b grid grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: "Transfer Qty", value: `${result.transfer_quantity} / ${result.total_quantity_in_scope}` },
            { label: "Mode", value: result.input_mode === "percentage" ? `${result.input_value}%` : `${result.input_value} units` },
            { label: "FROM Levy (before)", value: fmt(result.from_levy_total_before), accent: "text-blue-600 dark:text-blue-400" },
            { label: "TO Levy (after)", value: fmt(result.to_levy_total_after), accent: "text-emerald-600 dark:text-emerald-400" },
            { label: "Levy Difference", value: (result.levy_difference >= 0 ? "+" : "") + fmt(Math.abs(result.levy_difference)), accent: result.levy_difference < 0 ? "text-destructive" : "text-primary" },
            { label: "Tickets Affected", value: String(result.affected_tickets_count) },
            { label: "Tickets to Split", value: String(result.tickets_to_split_count), accent: result.tickets_to_split_count > 0 ? "text-amber-600 dark:text-amber-400" : "" },
            { label: "Operations", value: String(result.tickets.reduce((acc, t) => acc + (t.is_split ? 2 : 1), 0)) },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-muted/50 rounded p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`font-bold text-sm mt-0.5 ${accent ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>

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
                  <span className="text-muted-foreground">Original: {fmt(t.original_amount)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold text-primary">Final: {fmt(t.final_amount)}</span>
                  <span className={t.final_amount < t.original_amount ? "text-destructive font-semibold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>
                    {t.final_amount >= t.original_amount ? "+" : ""}{fmt(t.final_amount - t.original_amount)}
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
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Original Items</p>
                  <ul className="space-y-0.5 text-sm">
                    {t.original_items.map(i => (
                      <li key={i.ticket_item_id ?? `o-${i.item_id}`} className="flex justify-between">
                        <span>{i.quantity}× {i.item_name} <span className="text-xs text-muted-foreground">(levy {fmt(i.levy)})</span></span>
                        <span className="tabular-nums">{fmt(i.line_value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Final Items</p>
                  <ul className="space-y-0.5 text-sm">
                    {t.final_items.map((i, idx) => (
                      <li key={i.ticket_item_id ?? `n-${idx}`} className={`flex justify-between ${i.is_inserted ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                        <span>
                          {i.quantity}× {i.item_name} <span className="text-xs text-muted-foreground">(levy {fmt(i.levy)})</span>
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
            Confirming will transfer {result.transfer_quantity} units of {result.from_item_name} → {result.to_item_name} across {result.affected_tickets_count} ticket{result.affected_tickets_count !== 1 ? "s" : ""}.
          </p>
          <Button variant="outline" onClick={onCancel} disabled={loading}>← Back</Button>
          <Button onClick={handleCommit} disabled={loading || result.tickets.length === 0}>
            {loading ? "Applying…" : `Confirm & Apply Transfer`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
