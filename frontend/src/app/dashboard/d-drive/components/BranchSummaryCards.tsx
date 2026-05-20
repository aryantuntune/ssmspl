"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BranchSummary {
  branch_id: number;
  branch_name: string;
  ticket_count: number;
  total: number;
  cash: number;
  upi: number;
  online: number;
}

interface Props {
  summaries: BranchSummary[];
  onReconcile: (branchId: number, branchName: string, eligibleTotal: number) => void;
  onTransfer: (branchId: number, branchName: string) => void;
  loading: boolean;
  /**
   * When false (e.g. in route-scoped mode) the per-branch Transfer button is
   * hidden — transfers happen at the route level via the dedicated banner
   * above the cards.
   */
  showTransferButton?: boolean;
  /**
   * When false (e.g. in Transfer mode) the per-branch Reconcile button is
   * hidden — these cards are informational only in that mode.
   */
  showReconcileButton?: boolean;
  /** Selected payment mode — the Reconcile amount + the highlighted cell follow this. */
  paymentMode?: "CASH" | "UPI";
}

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BranchSummaryCards({
  summaries, onReconcile, onTransfer, loading, showTransferButton = true, showReconcileButton = true, paymentMode = "CASH",
}: Props) {
  if (loading) return <div className="text-muted-foreground py-6">Loading summaries…</div>;
  if (!summaries.length) return <div className="text-muted-foreground py-6">No data for selected filters.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {summaries.map(s => (
        <Card key={s.branch_id}>
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">{s.branch_name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{s.ticket_count} tickets</p>
            </div>
            <div className="flex gap-2">
              {showReconcileButton && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReconcile(s.branch_id, s.branch_name, paymentMode === "UPI" ? s.upi : s.cash)}
                >
                  Reconcile
                </Button>
              )}
              {showTransferButton && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onTransfer(s.branch_id, s.branch_name)}
                >
                  Transfer
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Total", value: s.total, className: "text-foreground", mode: null },
                { label: "Cash", value: s.cash, className: "text-emerald-600 dark:text-emerald-400", mode: "CASH" },
                { label: "UPI", value: s.upi, className: "text-blue-600 dark:text-blue-400", mode: "UPI" },
                { label: "Online", value: s.online, className: "text-amber-600 dark:text-amber-400", mode: null },
              ].map(({ label, value, className, mode }) => {
                const active = mode !== null && mode === paymentMode;
                return (
                  <div
                    key={label}
                    className={`rounded p-2 ${active ? "bg-primary/10 ring-1 ring-primary/40" : "bg-muted/50"}`}
                  >
                    <p className="text-xs text-muted-foreground">
                      {label}{active ? " · selected" : ""}
                    </p>
                    <p className={`font-bold text-sm ${className}`}>{fmt(value)}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
