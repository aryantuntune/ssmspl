"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface Summary {
  cash_total_before: number;
  total_adjustment_applied: number;
  cash_total_after: number;
  tickets_affected: number;
  items_affected: number;
  amount_not_applied: number;
}

interface Props {
  result: { batch_id: string; summary: Summary };
  onCancel: () => void;
  onCommitted: () => void;
}

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

export default function DryRunPreview({ result, onCancel, onCommitted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { summary, batch_id } = result;

  const handleCommit = async () => {
    setLoading(true);
    setError("");
    try {
      await api.post("/api/admin/d-drive/adjustment/commit", { batch_id });
      onCommitted();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Commit failed");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Dry-Run Preview — review before applying</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Cash Before", value: fmt(summary.cash_total_before), accent: "" },
          { label: "Adjustment Applied", value: fmt(summary.total_adjustment_applied), accent: "text-destructive" },
          { label: "Cash After", value: fmt(summary.cash_total_after), accent: "text-emerald-600 dark:text-emerald-400" },
          { label: "Not Applied", value: fmt(summary.amount_not_applied), accent: "" },
          { label: "Tickets Affected", value: String(summary.tickets_affected), accent: "" },
          { label: "Items Modified", value: String(summary.items_affected), accent: "" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-muted/50 rounded p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`font-bold text-sm mt-0.5 ${accent}`}>{value}</p>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>← Back</Button>
        <Button className="flex-1" onClick={handleCommit} disabled={loading}>
          {loading ? "Applying…" : "Confirm & Apply"}
        </Button>
      </div>
    </div>
  );
}
