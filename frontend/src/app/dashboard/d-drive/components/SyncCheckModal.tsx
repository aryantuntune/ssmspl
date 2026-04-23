"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle, PlayCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";

interface Diff {
  field: string;
  admin: unknown;
  sync: unknown;
}

interface TicketMismatch {
  ticket_id: number;
  branch_id: number;
  ticket_date: string;
  diffs: Diff[];
}

interface ItemMismatch {
  ticket_item_id: number;
  ticket_id: number;
  diffs: Diff[];
}

interface ItemMissing {
  ticket_item_id: number;
  ticket_id: number;
  item_id: number;
  rate: string | null;
  levy: string | null;
  quantity: number;
}

interface SyncCheckResult {
  in_sync: boolean;
  checked_range: { date_start: string; date_end: string; branch_id: number | null };
  totals: {
    admin_tickets: number;
    sync_tickets: number;
    admin_ticket_items: number;
    sync_ticket_items: number;
  };
  tickets: {
    missing_in_admin_count: number;
    only_in_admin_count: number;
    field_mismatch_count: number;
    missing_in_admin: number[];
    only_in_admin: number[];
    field_mismatch: TicketMismatch[];
  };
  ticket_items: {
    missing_in_admin_count: number;
    only_in_admin_count: number;
    field_mismatch_count: number;
    missing_in_admin: ItemMissing[];
    only_in_admin: ItemMissing[];
    field_mismatch: ItemMismatch[];
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  branches: { id: number; name: string }[];
  defaultDateStart: string;
  defaultDateEnd: string;
  defaultBranchId?: string;
}

export default function SyncCheckModal({ open, onClose, branches, defaultDateStart, defaultDateEnd, defaultBranchId }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [dateStart, setDateStart] = useState(defaultDateStart);
  const [dateEnd, setDateEnd] = useState(defaultDateEnd);
  const [branchId, setBranchId] = useState(defaultBranchId ?? "all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SyncCheckResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(""); setResult(null);
    setDateStart(defaultDateStart);
    setDateEnd(defaultDateEnd);
    setBranchId(defaultBranchId ?? "all");
    api.get<{ configured: boolean }>("/api/admin/d-drive/sync-check/status")
      .then(r => setConfigured(r.data.configured))
      .catch(() => setConfigured(false));
  }, [open, defaultDateStart, defaultDateEnd, defaultBranchId]);

  const runCheck = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const params: Record<string, string> = { date_start: dateStart, date_end: dateEnd };
      if (branchId !== "all") params.branch_id = branchId;
      const res = await api.get<SyncCheckResult>("/api/admin/d-drive/sync-check", { params });
      setResult(res.data);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Sync check failed");
    } finally {
      setLoading(false);
    }
  };

  const fmtCell = (v: unknown) => (v === null || v === undefined ? <em className="text-muted-foreground">null</em> : String(v));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="!max-w-[90vw] w-[90vw] !max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Sync Check — ssmspl_admin vs ssmspl_sync</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Verifies that the admin database matches the read-only mirror of production. Useful after rollbacks.
          </p>
        </DialogHeader>

        {configured === false && (
          <div className="px-6 py-4 text-sm text-destructive">
            Sync-check is not configured on this server. A system administrator needs to set <code>SYNC_DATABASE_URL</code> in the admin backend environment.
          </div>
        )}

        {configured !== false && (
          <>
            <div className="px-6 py-4 border-b grid grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>To Date</Label>
                <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={runCheck} disabled={loading || !dateStart || !dateEnd}>
                {loading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Checking…</> : <><PlayCircle className="w-4 h-4 mr-1" /> Run Check</>}
              </Button>
            </div>

            {error && (
              <div className="px-6 py-3 text-sm text-destructive border-b bg-destructive/5">{error}</div>
            )}

            <div className="flex-1 overflow-auto">
              {result === null && !loading && !error && (
                <p className="py-10 text-center text-muted-foreground text-sm">
                  Pick a date range (and optional branch) and click Run Check.
                </p>
              )}

              {result && (
                <>
                  <div className={`px-6 py-4 border-b ${result.in_sync ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-destructive/5"}`}>
                    <div className="flex items-center gap-3">
                      {result.in_sync ? (
                        <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-7 h-7 text-destructive" />
                      )}
                      <div>
                        <p className="font-bold text-lg">
                          {result.in_sync ? "Fully in sync" : "Drift detected"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {result.checked_range.date_start} → {result.checked_range.date_end}
                          {result.checked_range.branch_id ? ` · Branch #${result.checked_range.branch_id}` : " · All branches"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-3 border-b grid grid-cols-4 gap-3">
                    {[
                      { label: "Admin Tickets", value: result.totals.admin_tickets },
                      { label: "Sync Tickets", value: result.totals.sync_tickets },
                      { label: "Admin Items", value: result.totals.admin_ticket_items },
                      { label: "Sync Items", value: result.totals.sync_ticket_items },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-muted/50 rounded p-2">
                        <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                        <p className="font-bold text-sm mt-0.5">{value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 space-y-4">
                    <SectionCard
                      label="Tickets missing in admin (hard-deleted, no rollback)"
                      count={result.tickets.missing_in_admin_count}
                      empty={result.tickets.missing_in_admin_count === 0}
                    >
                      {result.tickets.missing_in_admin.length > 0 && (
                        <p className="text-xs font-mono">{result.tickets.missing_in_admin.map(id => `#${id}`).join(", ")}</p>
                      )}
                    </SectionCard>

                    <SectionCard
                      label="Tickets only in admin (extras — shouldn't happen normally)"
                      count={result.tickets.only_in_admin_count}
                      empty={result.tickets.only_in_admin_count === 0}
                    >
                      {result.tickets.only_in_admin.length > 0 && (
                        <p className="text-xs font-mono">{result.tickets.only_in_admin.map(id => `#${id}`).join(", ")}</p>
                      )}
                    </SectionCard>

                    <SectionCard
                      label="Tickets with field mismatch"
                      count={result.tickets.field_mismatch_count}
                      empty={result.tickets.field_mismatch_count === 0}
                    >
                      {result.tickets.field_mismatch.length > 0 && (
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-2 py-1 text-left">Ticket</th>
                              <th className="px-2 py-1 text-left">Field</th>
                              <th className="px-2 py-1 text-left">Admin</th>
                              <th className="px-2 py-1 text-left">Sync</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.tickets.field_mismatch.flatMap(t =>
                              t.diffs.map((d, idx) => (
                                <tr key={`${t.ticket_id}-${d.field}-${idx}`} className="border-t">
                                  <td className="px-2 py-1 font-mono">#{t.ticket_id}</td>
                                  <td className="px-2 py-1">{d.field}</td>
                                  <td className="px-2 py-1 text-destructive">{fmtCell(d.admin)}</td>
                                  <td className="px-2 py-1 text-emerald-700 dark:text-emerald-400">{fmtCell(d.sync)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      )}
                    </SectionCard>

                    <SectionCard
                      label="Ticket items missing in admin"
                      count={result.ticket_items.missing_in_admin_count}
                      empty={result.ticket_items.missing_in_admin_count === 0}
                    >
                      {result.ticket_items.missing_in_admin.length > 0 && (
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-2 py-1 text-left">Item row</th>
                              <th className="px-2 py-1 text-left">Ticket</th>
                              <th className="px-2 py-1 text-left">Item id</th>
                              <th className="px-2 py-1 text-right">Rate</th>
                              <th className="px-2 py-1 text-right">Levy</th>
                              <th className="px-2 py-1 text-right">Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.ticket_items.missing_in_admin.map(i => (
                              <tr key={i.ticket_item_id} className="border-t">
                                <td className="px-2 py-1 font-mono">#{i.ticket_item_id}</td>
                                <td className="px-2 py-1 font-mono">#{i.ticket_id}</td>
                                <td className="px-2 py-1">{i.item_id}</td>
                                <td className="px-2 py-1 text-right">{i.rate}</td>
                                <td className="px-2 py-1 text-right">{i.levy}</td>
                                <td className="px-2 py-1 text-right">{i.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </SectionCard>

                    <SectionCard
                      label="Ticket items only in admin"
                      count={result.ticket_items.only_in_admin_count}
                      empty={result.ticket_items.only_in_admin_count === 0}
                    >
                      {result.ticket_items.only_in_admin.length > 0 && (
                        <p className="text-xs font-mono">
                          {result.ticket_items.only_in_admin.map(i => `#${i.ticket_item_id}`).join(", ")}
                        </p>
                      )}
                    </SectionCard>

                    <SectionCard
                      label="Ticket items with field mismatch"
                      count={result.ticket_items.field_mismatch_count}
                      empty={result.ticket_items.field_mismatch_count === 0}
                    >
                      {result.ticket_items.field_mismatch.length > 0 && (
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-2 py-1 text-left">Item row</th>
                              <th className="px-2 py-1 text-left">Ticket</th>
                              <th className="px-2 py-1 text-left">Field</th>
                              <th className="px-2 py-1 text-left">Admin</th>
                              <th className="px-2 py-1 text-left">Sync</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.ticket_items.field_mismatch.flatMap(i =>
                              i.diffs.map((d, idx) => (
                                <tr key={`${i.ticket_item_id}-${d.field}-${idx}`} className="border-t">
                                  <td className="px-2 py-1 font-mono">#{i.ticket_item_id}</td>
                                  <td className="px-2 py-1 font-mono">#{i.ticket_id}</td>
                                  <td className="px-2 py-1">{d.field}</td>
                                  <td className="px-2 py-1 text-destructive">{fmtCell(d.admin)}</td>
                                  <td className="px-2 py-1 text-emerald-700 dark:text-emerald-400">{fmtCell(d.sync)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      )}
                    </SectionCard>
                  </div>
                </>
              )}
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

function SectionCard({
  label, count, empty, children,
}: { label: string; count: number; empty: boolean; children?: React.ReactNode }) {
  return (
    <div className={`border rounded-lg overflow-hidden ${empty ? "" : "border-destructive/50"}`}>
      <div className={`px-4 py-2 flex items-center justify-between ${empty ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-destructive/5"}`}>
        <p className="text-sm font-medium">{label}</p>
        <span className={`text-xs font-bold ${empty ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
          {empty ? "0 — OK" : count}
        </span>
      </div>
      {!empty && <div className="p-3">{children}</div>}
    </div>
  );
}
