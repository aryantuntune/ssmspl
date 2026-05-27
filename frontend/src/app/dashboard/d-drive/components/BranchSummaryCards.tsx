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
  other?: number;
}

interface Props {
  summaries: BranchSummary[];
  onReconcile: (branchId: number, branchName: string, cashTotal: number) => void;
  onTransfer: (branchId: number, branchName: string) => void;
  loading: boolean;
}

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BranchSummaryCards({ summaries, onReconcile, onTransfer, loading }: Props) {
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReconcile(s.branch_id, s.branch_name, s.cash)}
              >
                Reconcile
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onTransfer(s.branch_id, s.branch_name)}
              >
                Transfer
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Total", value: s.total, className: "text-foreground" },
                { label: "Cash", value: s.cash, className: "text-emerald-600 dark:text-emerald-400" },
                { label: "UPI", value: s.upi, className: "text-blue-600 dark:text-blue-400" },
                { label: "Online", value: s.online, className: "text-amber-600 dark:text-amber-400" },
                ...((s.other ?? 0) > 0
                  ? [{ label: "Other", value: s.other ?? 0, className: "text-slate-600 dark:text-slate-400" }]
                  : []),
              ].map(({ label, value, className }) => (
                <div key={label} className="bg-muted/50 rounded p-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`font-bold text-sm ${className}`}>{fmt(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
