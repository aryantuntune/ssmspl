"use client";
import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle, PlayCircle, Loader2, X, ChevronLeft, StopCircle } from "lucide-react";
import api from "@/lib/api";
import SyncCheckResultView, { SyncCheckResult } from "./SyncCheckResultView";

type BatchStatus = "pending" | "checking" | "in_sync" | "drift" | "error";

interface DayBatch {
  date: string;
  status: BatchStatus;
  result?: SyncCheckResult;
  error?: string;
  driftTotal?: number;  // sum of all mismatch/missing counts
}

interface Props {
  open: boolean;
  onClose: () => void;
  branches: { id: number; name: string }[];
  defaultDateStart: string;
  defaultDateEnd: string;
  defaultBranchId?: string;
}

const CONCURRENCY = 4;

function* eachDay(start: string, end: string): Generator<string> {
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function driftSum(r: SyncCheckResult): number {
  return (
    r.tickets.missing_in_admin_count +
    r.tickets.only_in_admin_count +
    r.tickets.field_mismatch_count +
    r.ticket_items.missing_in_admin_count +
    r.ticket_items.only_in_admin_count +
    r.ticket_items.field_mismatch_count
  );
}

export default function SyncCheckModal({ open, onClose, branches, defaultDateStart, defaultDateEnd, defaultBranchId }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [dateStart, setDateStart] = useState(defaultDateStart);
  const [dateEnd, setDateEnd] = useState(defaultDateEnd);
  const [branchId, setBranchId] = useState(defaultBranchId ?? "all");
  const [batches, setBatches] = useState<DayBatch[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError(""); setBatches([]); setFocusedDay(null);
    cancelRef.current = false;
    setDateStart(defaultDateStart);
    setDateEnd(defaultDateEnd);
    setBranchId(defaultBranchId ?? "all");
    api.get<{ configured: boolean }>("/api/admin/d-drive/sync-check/status")
      .then(r => setConfigured(r.data.configured))
      .catch(() => setConfigured(false));
  }, [open, defaultDateStart, defaultDateEnd, defaultBranchId]);

  const totalDays = dateStart && dateEnd ? daysBetween(dateStart, dateEnd) : 0;
  const checkedCount = batches.filter(b => b.status !== "pending" && b.status !== "checking").length;
  const driftDays = batches.filter(b => b.status === "drift").length;
  const errorDays = batches.filter(b => b.status === "error").length;
  const syncedDays = batches.filter(b => b.status === "in_sync").length;

  const cancel = () => { cancelRef.current = true; setRunning(false); };

  const runCheck = async () => {
    if (!dateStart || !dateEnd) { setError("Pick both dates."); return; }
    if (dateEnd < dateStart) { setError("End date must be >= start date."); return; }
    setError(""); setFocusedDay(null);
    cancelRef.current = false;

    // Build batches (one per day)
    const days = Array.from(eachDay(dateStart, dateEnd));
    const initialBatches: DayBatch[] = days.map(d => ({ date: d, status: "pending" }));
    setBatches(initialBatches);
    setRunning(true);

    const queue = [...days];
    const workers: Promise<void>[] = [];

    const updateBatch = (date: string, patch: Partial<DayBatch>) => {
      setBatches(prev => prev.map(b => (b.date === date ? { ...b, ...patch } : b)));
    };

    const worker = async () => {
      while (queue.length > 0) {
        if (cancelRef.current) return;
        const day = queue.shift();
        if (!day) return;
        updateBatch(day, { status: "checking" });
        try {
          const params: Record<string, string> = { date_start: day, date_end: day };
          if (branchId !== "all") params.branch_id = branchId;
          const res = await api.get<SyncCheckResult>("/api/admin/d-drive/sync-check", { params });
          const drift = driftSum(res.data);
          updateBatch(day, {
            status: drift === 0 ? "in_sync" : "drift",
            result: res.data,
            driftTotal: drift,
          });
        } catch (e) {
          const err = e as { response?: { data?: { detail?: string } } };
          updateBatch(day, { status: "error", error: err?.response?.data?.detail ?? "Check failed" });
        }
      }
    };

    for (let i = 0; i < Math.min(CONCURRENCY, days.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    setRunning(false);
  };

  // Focused day drilldown view
  const focusedBatch = focusedDay ? batches.find(b => b.date === focusedDay) : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="!max-w-[92vw] w-[92vw] !max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Sync Check — ssmspl_admin vs ssmspl_sync</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Compares per-day. Days with drift are highlighted red — click to see details.
          </p>
        </DialogHeader>

        {configured === false && (
          <div className="px-6 py-4 text-sm text-destructive">
            Sync-check is not configured on this server. Set <code>SYNC_DATABASE_URL</code> in the admin backend environment.
          </div>
        )}

        {configured !== false && !focusedBatch && (
          <>
            <div className="px-6 py-4 border-b grid grid-cols-5 gap-4 items-end">
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} disabled={running} />
              </div>
              <div className="space-y-1.5">
                <Label>To Date</Label>
                <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} disabled={running} />
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId} disabled={running}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex gap-2">
                {!running ? (
                  <Button onClick={runCheck} disabled={!dateStart || !dateEnd} className="flex-1">
                    <PlayCircle className="w-4 h-4 mr-1" /> Run Check ({totalDays} day{totalDays !== 1 ? "s" : ""})
                  </Button>
                ) : (
                  <Button onClick={cancel} variant="outline" className="flex-1">
                    <StopCircle className="w-4 h-4 mr-1" /> Stop
                  </Button>
                )}
              </div>
            </div>

            {error && <div className="px-6 py-3 text-sm text-destructive border-b bg-destructive/5">{error}</div>}

            {batches.length > 0 && (
              <>
                {/* Progress / summary bar */}
                <div className="px-6 py-3 border-b bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      {running ? "Checking…" : "Complete"}:
                      <span className="ml-2">{checkedCount} / {batches.length} days</span>
                    </p>
                    <div className="flex gap-3 text-xs">
                      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> In sync: <strong>{syncedDays}</strong>
                      </span>
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="w-3 h-3" /> Drift: <strong>{driftDays}</strong>
                      </span>
                      {errorDays > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          Errors: <strong>{errorDays}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* progress bar */}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${batches.length > 0 ? (checkedCount / batches.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Day grid */}
                <div className="flex-1 overflow-auto p-6">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
                    {batches.map(b => (
                      <DayCell key={b.date} batch={b} onClick={() => b.result && setFocusedDay(b.date)} />
                    ))}
                  </div>
                  {!running && checkedCount === batches.length && driftDays === 0 && errorDays === 0 && (
                    <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <p className="font-semibold">All {batches.length} day(s) fully in sync with prod mirror.</p>
                        <p className="text-xs text-muted-foreground">No drift detected in any ticket or ticket_item across the selected range.</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Focused day drilldown */}
        {configured !== false && focusedBatch && focusedBatch.result && (
          <>
            <div className="px-6 py-3 border-b flex items-center gap-3 bg-muted/20">
              <Button size="sm" variant="outline" onClick={() => setFocusedDay(null)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back to grid
              </Button>
              <span className="text-sm font-semibold">
                {focusedBatch.date}
                {branchId !== "all" && ` · Branch #${branchId}`}
              </span>
              {focusedBatch.status === "drift" ? (
                <span className="ml-auto flex items-center gap-1 text-destructive text-sm font-semibold">
                  <AlertCircle className="w-4 h-4" /> Drift detected
                </span>
              ) : (
                <span className="ml-auto flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> In sync
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto p-6">
              <SyncCheckResultView result={focusedBatch.result} />
            </div>
          </>
        )}

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DayCell({ batch, onClick }: { batch: DayBatch; onClick: () => void }) {
  const statusConfig = {
    pending: { bg: "bg-muted", text: "text-muted-foreground", label: "" },
    checking: { bg: "bg-blue-100 dark:bg-blue-950/50 animate-pulse", text: "text-blue-700 dark:text-blue-300", label: "checking…" },
    in_sync: { bg: "bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900", label: "in sync" },
    drift: { bg: "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 cursor-pointer", text: "text-red-700 dark:text-red-400 border-red-200 dark:border-red-900", label: "" },
    error: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900", label: "error" },
  };
  const c = statusConfig[batch.status];
  const clickable = batch.status === "drift" || batch.status === "in_sync";

  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`border rounded p-2 text-left transition ${c.bg} ${c.text} ${clickable ? "cursor-pointer" : "cursor-default"}`}
      title={batch.error || (batch.result ? `Admin tickets: ${batch.result.totals.admin_tickets}` : batch.date)}
    >
      <p className="text-[10px] font-mono">{batch.date}</p>
      {batch.status === "drift" && (
        <p className="text-sm font-bold mt-1">
          {batch.driftTotal} {batch.driftTotal === 1 ? "issue" : "issues"}
        </p>
      )}
      {batch.status === "in_sync" && (
        <p className="text-[10px] mt-1 flex items-center gap-0.5">
          <CheckCircle2 className="w-3 h-3 inline" /> OK
        </p>
      )}
      {batch.status === "checking" && (
        <p className="text-[10px] mt-1 flex items-center gap-0.5">
          <Loader2 className="w-3 h-3 animate-spin" /> {c.label}
        </p>
      )}
      {batch.status === "error" && <p className="text-[10px] mt-1 truncate">{batch.error}</p>}
      {batch.status === "pending" && <p className="text-[10px] mt-1">queued</p>}
    </button>
  );
}
