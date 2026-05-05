"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import TransferDryRunPreview, { TransferDryRunResult } from "./TransferDryRunPreview";

type Props =
  | {
      open: boolean;
      mode: "branch";
      branchId: number;
      branchName: string;
      dateStart: string;
      dateEnd: string;
      onClose: () => void;
      onCommitted: () => void;
    }
  | {
      open: boolean;
      mode: "route";
      routeId: number;
      routeLabel: string;
      dateStart: string;
      dateEnd: string;
      onClose: () => void;
      onCommitted: () => void;
    };

interface AllowItem {
  item_id: number;
  item_name: string;
  allowed_as_transfer_from: boolean;
  allowed_as_transfer_to: boolean;
}

interface ScopeData {
  total_quantity: number;
  from_levy_total: number;
  from_levy_representative: number | null;
  routes: { route_id: number; count: number }[];
  branch_ids?: number[];
}

export default function TransferModal(props: Props) {
  const { open, dateStart, dateEnd, onClose, onCommitted } = props;
  const isRouteMode = props.mode === "route";
  const titleScope = isRouteMode ? props.routeLabel : props.branchName;
  const subtitleScope = isRouteMode
    ? `Route: ${props.routeLabel} (BOTH branches participate)`
    : `Branch: ${props.branchName}`;

  // Identifier to pass back to TransferDryRunPreview (its `branchName` prop is
  // legacy — we still pass the human label so the title stays meaningful).
  const previewLabel = isRouteMode ? `Route ${props.routeLabel}` : props.branchName;

  const [allowList, setAllowList] = useState<AllowItem[]>([]);
  const [fromItemId, setFromItemId] = useState<string>("");
  const [toItemId, setToItemId] = useState<string>("");
  const [inputMode, setInputMode] = useState<"percentage" | "quantity">("quantity");
  const [inputValue, setInputValue] = useState("");
  const [scope, setScope] = useState<ScopeData | null>(null);
  const [toMasterPreview, setToMasterPreview] = useState<{ rate: number | null; levy: number | null; total: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dryRunResult, setDryRunResult] = useState<TransferDryRunResult | null>(null);

  // Build the scope query params once per render so the dependencies on the
  // useEffect below match the actual call shape.
  const scopeParamsBase: Record<string, string | number> = isRouteMode
    ? { route_id: props.routeId, date_start: dateStart, date_end: dateEnd }
    : { branch_id: props.branchId, date_start: dateStart, date_end: dateEnd };

  useEffect(() => {
    api.get<AllowItem[]>("/api/admin/parameter-master/items/transfer")
      .then(r => setAllowList(r.data))
      .catch(() => {});
  }, []);

  // Fetch scope data when FROM item changes
  useEffect(() => {
    if (!fromItemId) { setScope(null); return; }
    api.get<ScopeData>("/api/admin/d-drive/transfer/scope", {
      params: { ...scopeParamsBase, from_item_id: fromItemId },
    }).then(r => setScope(r.data)).catch(() => setScope(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromItemId, isRouteMode ? props.routeId : props.branchId, dateStart, dateEnd]);

  // Fetch TO master (rate + levy) from first route in scope
  useEffect(() => {
    if (!toItemId || !scope || scope.routes.length === 0) { setToMasterPreview(null); return; }
    const firstRoute = scope.routes[0].route_id;
    api.get<{ rate: number | null; levy: number | null; total: number | null }>("/api/admin/d-drive/transfer/to-master-preview", {
      params: { to_item_id: toItemId, route_id: firstRoute },
    }).then(r => setToMasterPreview(r.data)).catch(() => setToMasterPreview(null));
  }, [toItemId, scope]);

  const fromItems = allowList.filter(i => i.allowed_as_transfer_from);
  const toItems = allowList.filter(i => i.allowed_as_transfer_to && String(i.item_id) !== fromItemId);

  const transferQty = (() => {
    if (!scope || !inputValue) return 0;
    const v = parseFloat(inputValue);
    if (!v || v <= 0) return 0;
    if (inputMode === "percentage") return Math.floor(scope.total_quantity * v / 100);
    return Math.floor(v);
  })();

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleDryRun = async () => {
    setError("");
    if (!fromItemId || !toItemId) { setError("Select both FROM and TO items."); return; }
    if (!inputValue || parseFloat(inputValue) <= 0) { setError("Enter a valid positive value."); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        date_start: dateStart,
        date_end: dateEnd,
        from_item_id: parseInt(fromItemId),
        to_item_id: parseInt(toItemId),
        input_mode: inputMode,
        input_value: parseFloat(inputValue),
      };
      if (isRouteMode) body.route_id = props.routeId;
      else body.branch_id = props.branchId;
      const res = await api.post<TransferDryRunResult>("/api/admin/d-drive/transfer/dry-run", body);
      setDryRunResult(res.data);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Dry-run failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFromItemId(""); setToItemId(""); setInputValue(""); setInputMode("quantity");
    setScope(null); setToMasterPreview(null); setDryRunResult(null); setError("");
    onClose();
  };

  if (dryRunResult) {
    return (
      <TransferDryRunPreview
        result={dryRunResult}
        branchName={previewLabel}
        onCancel={() => setDryRunResult(null)}
        onCommitted={() => { handleClose(); onCommitted(); }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Transfer Items {isRouteMode ? "— Route " : "— "}{titleScope}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {subtitleScope} · {dateStart} → {dateEnd} · CASH tickets only
          </p>
          {isRouteMode && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Both endpoint branches are aggregated. FIFO across the route by ticket creation time.
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>FROM Item</Label>
              <Select value={fromItemId} onValueChange={setFromItemId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {fromItems.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No items marked as Allowed as FROM</div>}
                  {fromItems.map(i => (
                    <SelectItem key={i.item_id} value={String(i.item_id)}>{i.item_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>TO Item</Label>
              <Select value={toItemId} onValueChange={setToItemId} disabled={!fromItemId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {toItems.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No items marked as Allowed as TO</div>}
                  {toItems.map(i => (
                    <SelectItem key={i.item_id} value={String(i.item_id)}>{i.item_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {scope && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-200">
                FROM Section{isRouteMode ? " (route-aggregated)" : ""}
              </p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-muted-foreground">Total Qty:</span> <strong>{scope.total_quantity}</strong></div>
                <div><span className="text-muted-foreground">Levy (typical):</span> <strong>{scope.from_levy_representative != null ? fmt(scope.from_levy_representative) : "—"}</strong></div>
                <div><span className="text-muted-foreground">Total Levy:</span> <strong>{fmt(scope.from_levy_total)}</strong></div>
                {scope.routes.length > 1 && (
                  <div className="col-span-3 text-xs text-amber-700 dark:text-amber-300">
                    Spans {scope.routes.length} routes — per-ticket levy resolved at dry-run.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 items-end">
            <div className="col-span-1 space-y-1.5">
              <Label>Input Mode</Label>
              <Select value={inputMode} onValueChange={v => setInputMode(v as "percentage" | "quantity")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quantity">Quantity</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{inputMode === "percentage" ? "Percentage (0–100)" : "Quantity (integer)"}</Label>
              <Input
                type="number"
                min={inputMode === "percentage" ? "0.01" : "1"}
                max={inputMode === "percentage" ? "100" : undefined}
                step={inputMode === "percentage" ? "0.01" : "1"}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={inputMode === "percentage" ? "e.g. 50" : "e.g. 10"}
              />
            </div>
          </div>

          {toItemId && scope && transferQty > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">TO Section (estimate)</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-muted-foreground">Transfer Qty (FROM):</span> <strong>{transferQty}</strong></div>
                <div><span className="text-muted-foreground">TO Unit (rate+levy):</span> <strong>{toMasterPreview?.total != null ? fmt(toMasterPreview.total) : "—"}</strong></div>
                <div><span className="text-muted-foreground">Est. TO Qty Created:</span> <strong>{toMasterPreview?.total && scope.from_levy_representative != null ? Math.floor(transferQty * ((scope.from_levy_total / scope.total_quantity) || 1) / toMasterPreview.total) : "—"}</strong></div>
              </div>
              <p className="text-xs text-muted-foreground">Exact per-ticket quantities computed during Trial Preview.</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleDryRun} disabled={loading || !fromItemId || !toItemId || !inputValue}>
            {loading ? "Calculating…" : "Run Trial Preview →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
