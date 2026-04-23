"use client";
import React from "react";

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

export interface SyncCheckResult {
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

export default function SyncCheckResultView({ result }: { result: SyncCheckResult }) {
  const fmtCell = (v: unknown) =>
    v === null || v === undefined ? <em className="text-muted-foreground">null</em> : String(v);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
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

      <SectionCard
        label="Tickets missing in admin (hard-deleted, no rollback)"
        count={result.tickets.missing_in_admin_count}
        empty={result.tickets.missing_in_admin_count === 0}
      >
        {result.tickets.missing_in_admin.length > 0 && (
          <p className="text-xs font-mono break-all">
            {result.tickets.missing_in_admin.map(id => `#${id}`).join(", ")}
          </p>
        )}
      </SectionCard>

      <SectionCard
        label="Tickets only in admin (extras — shouldn't happen normally)"
        count={result.tickets.only_in_admin_count}
        empty={result.tickets.only_in_admin_count === 0}
      >
        {result.tickets.only_in_admin.length > 0 && (
          <p className="text-xs font-mono break-all">
            {result.tickets.only_in_admin.map(id => `#${id}`).join(", ")}
          </p>
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
          <p className="text-xs font-mono break-all">
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
      {!empty && <div className="p-3 overflow-x-auto">{children}</div>}
    </div>
  );
}
