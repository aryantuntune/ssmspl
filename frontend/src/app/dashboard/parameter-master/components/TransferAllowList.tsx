"use client";
import { useEffect, useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ArrowRightCircle, ArrowLeftCircle, X } from "lucide-react";
import api from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";

interface TransferItem {
  item_id: number;
  item_name: string;
  allowed_as_transfer_from: boolean;
  allowed_as_transfer_to: boolean;
}

export default function TransferAllowList() {
  const user = useDashboardUser();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [items, setItems] = useState<TransferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = () =>
    api.get<TransferItem[]>("/api/admin/parameter-master/items/transfer")
      .then(r => setItems(r.data))
      .catch(() => setError("Could not load transfer allowlist"))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => items.filter(i => i.item_name.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  );

  const fromCount = items.filter(i => i.allowed_as_transfer_from).length;
  const toCount = items.filter(i => i.allowed_as_transfer_to).length;
  const filteredIds = useMemo(() => filtered.map(i => i.item_id), [filtered]);
  const selectedFiltered = filteredIds.filter(id => selected.has(id));
  const allFilteredSelected = filtered.length > 0 && selectedFiltered.length === filtered.length;
  const someFilteredSelected = selectedFiltered.length > 0 && !allFilteredSelected;

  const toggleIndividual = async (item: TransferItem, field: "from" | "to") => {
    if (!isSuperAdmin) return;
    const current = field === "from" ? item.allowed_as_transfer_from : item.allowed_as_transfer_to;
    setSaving(true); setError("");
    setItems(prev => prev.map(i => i.item_id === item.item_id
      ? { ...i, [field === "from" ? "allowed_as_transfer_from" : "allowed_as_transfer_to"]: !current }
      : i));
    try {
      await api.put("/api/admin/parameter-master/items/transfer/bulk", {
        item_ids: [item.item_id], field, allowed: !current,
      });
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Save failed");
      await load();
    } finally { setSaving(false); }
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelected(prev => { const n = new Set(prev); for (const id of filteredIds) n.delete(id); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); for (const id of filteredIds) n.add(id); return n; });
    }
  };
  const clearSelection = () => setSelected(new Set());

  const bulkUpdate = async (field: "from" | "to", allowed: boolean) => {
    if (!isSuperAdmin || selected.size === 0) return;
    const ids = Array.from(selected);
    setSaving(true); setError("");
    setItems(prev => prev.map(i => selected.has(i.item_id)
      ? { ...i, [field === "from" ? "allowed_as_transfer_from" : "allowed_as_transfer_to"]: allowed }
      : i));
    try {
      await api.put("/api/admin/parameter-master/items/transfer/bulk", { item_ids: ids, field, allowed });
      setSelected(new Set());
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Bulk update failed");
      await load();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="py-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-muted-foreground text-sm">
          Control which items appear in the Transfer Items dropdowns. An item must be marked as
          <strong> Allowed as FROM</strong> to appear as a transfer source, and as <strong>Allowed as TO</strong> to appear as a target.
        </p>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <ArrowRightCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-muted-foreground">FROM:</span>
            <strong className="text-blue-600 dark:text-blue-400">{fromCount}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowLeftCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-muted-foreground">TO:</span>
            <strong className="text-emerald-600 dark:text-emerald-400">{toCount}</strong>
          </span>
        </div>
      </div>

      {error && <div className="bg-destructive/10 text-destructive px-4 py-2 rounded text-sm">{error}</div>}

      {isSuperAdmin && selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 rounded-lg flex items-center gap-3 flex-wrap shadow">
          <span className="text-sm font-medium">{selected.size} item{selected.size !== 1 ? "s" : ""} selected</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => bulkUpdate("from", true)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white border-none">FROM: On</Button>
            <Button size="sm" variant="secondary" onClick={() => bulkUpdate("from", false)} disabled={saving}>FROM: Off</Button>
            <Button size="sm" variant="secondary" onClick={() => bulkUpdate("to", true)} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white border-none">TO: On</Button>
            <Button size="sm" variant="secondary" onClick={() => bulkUpdate("to", false)} disabled={saving}>TO: Off</Button>
            <Button size="sm" variant="secondary" onClick={clearSelection} disabled={saving}><X className="w-4 h-4 mr-1" /> Clear</Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden divide-y">
        {isSuperAdmin && filtered.length > 0 && (
          <div className="px-4 py-2 bg-muted/50 flex items-center gap-3 text-xs text-muted-foreground">
            <Checkbox
              checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
              onCheckedChange={toggleSelectAllFiltered}
              aria-label="Select all items in current view"
            />
            <span>
              {allFilteredSelected ? `All ${filtered.length} visible selected`
                : someFilteredSelected ? `${selectedFiltered.length} of ${filtered.length} visible selected`
                : `Select all ${filtered.length} visible`}
            </span>
            <div className="ml-auto flex gap-8">
              <span className="w-20 text-center">Allow as FROM</span>
              <span className="w-20 text-center">Allow as TO</span>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted-foreground text-sm">
            {items.length === 0 ? "No items found." : "No items match your search."}
          </p>
        ) : (
          filtered.map(item => {
            const isSelected = selected.has(item.item_id);
            return (
              <div key={item.item_id} className={`px-4 py-3 flex items-center gap-3 ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                {isSuperAdmin && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(item.item_id)}
                    aria-label={`Select ${item.item_name}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.item_name}</p>
                </div>
                <div className="flex items-center gap-8 shrink-0">
                  <div className="w-20 flex justify-center">
                    <Switch
                      checked={item.allowed_as_transfer_from}
                      disabled={!isSuperAdmin || saving}
                      onCheckedChange={() => toggleIndividual(item, "from")}
                    />
                  </div>
                  <div className="w-20 flex justify-center">
                    <Switch
                      checked={item.allowed_as_transfer_to}
                      disabled={!isSuperAdmin || saving}
                      onCheckedChange={() => toggleIndividual(item, "to")}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isSuperAdmin && (
        <p className="text-xs text-muted-foreground italic">
          You have read-only access. Contact a System Administrator to change transfer allowlist.
        </p>
      )}
    </div>
  );
}
