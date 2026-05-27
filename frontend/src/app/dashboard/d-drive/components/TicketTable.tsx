"use client";
import { Button } from "@/components/ui/button";

interface Ticket {
  id: number;
  ticket_date: string;
  branch_name: string;
  payment_mode: string;
  net_amount: number;
  operator_name: string;
  item_summary: string;
}

interface Props {
  tickets: Ticket[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (p: number) => void;
}

const modeClass: Record<string, string> = {
  CASH: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  UPI: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  CARD: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ONLINE: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
};

export default function TicketTable({ tickets, total, page, totalPages, loading, onPageChange }: Props) {
  if (loading) return <div className="text-muted-foreground py-6">Loading tickets…</div>;

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
          <tr>
            {["Ticket ID", "Date", "Branch", "Mode", "Amount", "Operator", "Items"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.map((t, i) => (
            <tr key={t.id} className={`border-t ${i % 2 === 1 ? "bg-muted/20" : ""} hover:bg-muted/30`}>
              <td className="px-4 py-2.5 font-mono text-primary">#{t.id}</td>
              <td className="px-4 py-2.5">{t.ticket_date}</td>
              <td className="px-4 py-2.5">{t.branch_name}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${modeClass[t.payment_mode] ?? ""}`}>
                  {t.payment_mode}
                </span>
              </td>
              <td className="px-4 py-2.5 font-semibold">
                ₹{t.net_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{t.operator_name ?? "—"}</td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">{t.item_summary}</td>
            </tr>
          ))}
          {!tickets.length && (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No tickets found.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-sm text-muted-foreground">
        <span>Showing page {page} of {totalPages} ({total} total)</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</Button>
        </div>
      </div>
    </div>
  );
}
