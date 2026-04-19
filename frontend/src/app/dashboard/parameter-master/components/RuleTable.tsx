"use client";
import { Button } from "@/components/ui/button";

interface Rule {
  id: number;
  priority_order: number;
  branch_scope: number | null;
  item_id: number | null;
  payment_mode: string;
  ticket_selection_order: string;
  max_adjustment_per_ticket: number | null;
  max_adjustment_per_item: number | null;
  max_total_adjustment_per_rule: number | null;
  stop_on_match: boolean;
  is_active: boolean;
  is_protected: boolean;
  min_remaining_per_item: number;
}

interface Props {
  rules: Rule[];
  isSuperAdmin: boolean;
  onEdit: (rule: Rule) => void;
  onToggle: (rule: Rule) => void | Promise<void>;
  onPreview: (ruleId: number) => void;
  branches: { id: number; name: string }[];
  items: { id: number; name: string }[];
}

export default function RuleTable({ rules, isSuperAdmin, onEdit, onToggle, onPreview, branches, items }: Props) {
  const branchName = (id: number | null) => id ? (branches.find(b => b.id === id)?.name ?? String(id)) : "All";
  const itemName = (id: number | null) => id ? (items.find(i => i.id === id)?.name ?? String(id)) : "All";

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
          <tr>
            {["#", "Branch", "Item", "Mode", "Type", "Order", "Max/Rule", "Stop", "Status", "Actions"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.map(r => (
            <tr key={r.id} className={`border-t hover:bg-muted/20 ${!r.is_active ? "opacity-50" : ""}`}>
              <td className="px-4 py-2.5 font-bold text-muted-foreground">{r.priority_order}</td>
              <td className="px-4 py-2.5">{branchName(r.branch_scope)}</td>
              <td className="px-4 py-2.5">{itemName(r.item_id)}</td>
              <td className="px-4 py-2.5">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                  {r.payment_mode}
                </span>
              </td>
              <td className="px-4 py-2.5">
                {r.is_protected ? (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    Protected
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    Deletable
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.ticket_selection_order}</td>
              <td className="px-4 py-2.5">{r.max_total_adjustment_per_rule != null ? `₹${r.max_total_adjustment_per_rule}` : "—"}</td>
              <td className="px-4 py-2.5">{r.stop_on_match ? "Yes" : "No"}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onPreview(r.id)}>Preview</Button>
                  {isSuperAdmin && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => onToggle(r)}>
                        {r.is_active ? "Disable" : "Enable"}
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!rules.length && (
            <tr>
              <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                No rules defined yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
