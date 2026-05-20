"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import DryRunPreview, { DryRunResult } from "./DryRunPreview";

interface Props {
  open: boolean;
  branchId: number;
  branchName: string;
  cashTotal: number;
  paymentMode: "CASH" | "UPI";
  dateStart: string;
  dateEnd: string;
  onClose: () => void;
  onCommitted: () => void;
}

export default function AdjustmentModal({
  open, branchId, branchName, cashTotal, paymentMode, dateStart, dateEnd, onClose, onCommitted,
}: Props) {
  const [amount, setAmount] = useState("");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDryRun = async () => {
    setError("");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid positive amount."); return; }
    setLoading(true);
    try {
      const res = await api.post<DryRunResult>("/api/admin/d-drive/adjustment/dry-run", {
        branch_id: branchId,
        date_start: dateStart,
        date_end: dateEnd,
        adjustment_amount: amt,
        payment_mode: paymentMode,
      });
      setDryRunResult(res.data);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Dry-run failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount(""); setDryRunResult(null); setError("");
    onClose();
  };

  if (dryRunResult) {
    return (
      <DryRunPreview
        result={dryRunResult}
        branchName={branchName}
        onCancel={() => setDryRunResult(null)}
        onCommitted={() => { handleClose(); onCommitted(); }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Process Reconciliation — {branchName} ({paymentMode})</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {paymentMode} eligible: ₹{cashTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Adjustment Amount (₹)</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="text-xl font-semibold"
          />
          <p className="text-xs text-muted-foreground">
            The system will delete unprotected line items from {paymentMode} tickets to reach this amount.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleDryRun} disabled={loading}>
            {loading ? "Calculating…" : "Run Trial Preview →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
