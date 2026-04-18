"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface PreviewData {
  eligible_tickets: number;
  eligible_items: number;
  cash_total: number;
}

interface Props {
  ruleId: number | null;
  branchId: string;
  dateStart: string;
  dateEnd: string;
  onClose: () => void;
}

export default function PreviewModal({ ruleId, branchId, dateStart, dateEnd, onClose }: Props) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ruleId) return;
    setLoading(true);
    setData(null);
    api.post(`/api/admin/parameter-master/${ruleId}/preview`, {
      branch_id: branchId !== "all" ? parseInt(branchId) : null,
      date_start: dateStart,
      date_end: dateEnd,
    })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ruleId, branchId, dateStart, dateEnd]);

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <Dialog open={!!ruleId} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rule Preview</DialogTitle>
        </DialogHeader>
        {loading && <p className="text-muted-foreground py-4 text-sm">Loading…</p>}
        {data && !loading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Eligible Tickets", value: String(data.eligible_tickets) },
              { label: "Eligible Items", value: String(data.eligible_items) },
              { label: "Cash Total", value: fmt(data.cash_total) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/50 rounded p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-bold text-sm mt-1">{value}</p>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" onClick={onClose} className="w-full mt-2">Close</Button>
      </DialogContent>
    </Dialog>
  );
}
