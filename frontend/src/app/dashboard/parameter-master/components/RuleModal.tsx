"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";

interface Rule {
  id?: number;
  priority_order: number;
  branch_scope: number | null;
  item_id: number | null;
  payment_mode: string;
  ticket_selection_order: string;
  max_adjustment_per_ticket: number | null;
  max_adjustment_per_item: number | null;
  max_total_adjustment_per_rule: number | null;
  stop_on_match: boolean;
}

interface Props {
  rule: Rule | null;
  branches: { id: number; name: string }[];
  items: { id: number; name: string }[];
  onSaved: () => void;
  onClose: () => void;
}

const EMPTY: Rule = {
  priority_order: 1,
  branch_scope: null,
  item_id: null,
  payment_mode: "CASH",
  ticket_selection_order: "FIFO",
  max_adjustment_per_ticket: null,
  max_adjustment_per_item: null,
  max_total_adjustment_per_rule: null,
  stop_on_match: false,
};

export default function RuleModal({ rule, branches, items, onSaved, onClose }: Props) {
  const [form, setForm] = useState<Rule>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setForm(rule ?? EMPTY); setError(""); }, [rule]);

  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        branch_scope: form.branch_scope || null,
        item_id: form.item_id || null,
        max_adjustment_per_ticket: form.max_adjustment_per_ticket || null,
        max_adjustment_per_item: form.max_adjustment_per_item || null,
        max_total_adjustment_per_rule: form.max_total_adjustment_per_rule || null,
        ticket_conditions: {},
        item_conditions: {},
      };
      if (form.id) {
        await api.put(`/api/admin/parameter-master/${form.id}`, payload);
      } else {
        await api.post("/api/admin/parameter-master", payload);
      }
      onSaved();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Save failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit Rule" : "New Rule"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Priority Order</Label>
            <Input
              type="number"
              value={form.priority_order}
              onChange={e => set("priority_order", parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ticket Selection Order</Label>
            <Select value={form.ticket_selection_order} onValueChange={v => set("ticket_selection_order", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["FIFO", "LIFO", "HIGHEST_VALUE", "LOWEST_VALUE"].map(o =>
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Branch Scope</Label>
            <Select
              value={String(form.branch_scope ?? "all")}
              onValueChange={v => set("branch_scope", v === "all" ? null : parseInt(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select
              value={String(form.item_id ?? "all")}
              onValueChange={v => set("item_id", v === "all" ? null : parseInt(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Max / Rule (₹)</Label>
            <Input
              type="number"
              placeholder="No limit"
              value={form.max_total_adjustment_per_rule ?? ""}
              onChange={e => set("max_total_adjustment_per_rule", e.target.value ? parseFloat(e.target.value) : null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max / Ticket (₹)</Label>
            <Input
              type="number"
              placeholder="No limit"
              value={form.max_adjustment_per_ticket ?? ""}
              onChange={e => set("max_adjustment_per_ticket", e.target.value ? parseFloat(e.target.value) : null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max / Item (₹)</Label>
            <Input
              type="number"
              placeholder="No limit"
              value={form.max_adjustment_per_item ?? ""}
              onChange={e => set("max_adjustment_per_item", e.target.value ? parseFloat(e.target.value) : null)}
            />
          </div>
          <div className="flex items-center gap-3 pt-4">
            <Switch checked={form.stop_on_match} onCheckedChange={v => set("stop_on_match", v)} />
            <Label>Stop on match</Label>
          </div>
        </div>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Saving…" : "Save Rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
