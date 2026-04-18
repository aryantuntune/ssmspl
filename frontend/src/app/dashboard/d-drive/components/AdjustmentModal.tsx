"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import DryRunPreview from "./DryRunPreview";

interface Props {
  open: boolean;
  branchId: number;
  branchName: string;
  cashTotal: number;
  dateStart: string;
  dateEnd: string;
  onClose: () => void;
  onCommitted: () => void;
}

export default function AdjustmentModal({
  open, branchId, branchName, cashTotal, dateStart, dateEnd, onClose, onCommitted,
}: Props) {
  const [amount, setAmount] = useState("");
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDryRun = async () => {
    setError("");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid positive amount."); return; }
    if (amt > cashTotal) { setError(`Amount exceeds cash total (₹${cashTotal.toFixed(2)})`); return; }
    setLoading(true);
    try {
      const res = await api.post("/api/admin/d-drive/adjustment/dry-run", {
        branch_id: branchId,
        date_start: dateStart,
        date_end: dateEnd,
        adjustment_amount: amt,
      });
      setDryRunResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Dry-run failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount(""); setDryRunResult(null); setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Process Reconciliation — {branchName}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Cash eligible: ₹{cashTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </DialogHeader>

        {!dryRunResult ? (
          <>
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
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleDryRun} disabled={loading}>
                {loading ? "Calculating…" : "Run Dry-Run Preview →"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DryRunPreview
            result={dryRunResult}
            onCancel={() => setDryRunResult(null)}
            onCommitted={() => { handleClose(); onCommitted(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
