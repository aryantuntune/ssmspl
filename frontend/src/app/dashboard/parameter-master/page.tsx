"use client";
import { useEffect, useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ShieldCheck, Trash2, X } from "lucide-react";
import api from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";

interface Item {
  item_id: number;
  item_name: string;
  is_protected: boolean;
}

export default function ParameterMasterPage() {
  const user = useDashboardUser();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = () =>
    api.get<Item[]>("/api/admin/parameter-master/items")
      .then(r => setItems(r.data))
      .catch(() => setError("Could not load items"))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => items.filter(i => i.item_name.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  );

  const protectedCount = items.filter(i => i.is_protected).length;
  const deletableCount = items.length - protectedCount;

  const filteredIds = useMemo(() => filtered.map(i => i.item_id), [filtered]);
  const selectedFiltered = filteredIds.filter(id => selected.has(id));
  const allFilteredSelected = filtered.length > 0 && selectedFiltered.length === filtered.length;
  const someFilteredSelected = selectedFiltered.length > 0 && !allFilteredSelected;

  const toggleOne = async (item: Item) => {
    if (!isSuperAdmin) return;
    const newValue = !item.is_protected;
    setSaving(item.item_id);
    setError("");
    setItems(prev => prev.map(i => i.item_id === item.item_id ? { ...i, is_protected: newValue } : i));
    try {
      await api.put(`/api/admin/parameter-master/items/${item.item_id}`, { is_protected: newValue });
    } catch (e) {
      setItems(prev => prev.map(i => i.item_id === item.item_id ? { ...i, is_protected: item.is_protected } : i));
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Save failed");
    } finally {
      setSaving(null);
    }
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
      // Deselect all filtered
      setSelected(prev => {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      });
    } else {
      // Select all filtered
      setSelected(prev => {
        const next = new Set(prev);
        for (const id of filteredIds) next.add(id);
        return next;
      });
    }
  };

  const clearSelection = () => setSelected(new Set());

  const bulkUpdate = async (makeProtected: boolean) => {
    if (!isSuperAdmin || selected.size === 0) return;
    const ids = Array.from(selected);
    setBulkSaving(true);
    setError("");
    // Optimistic update
    setItems(prev => prev.map(i => selected.has(i.item_id) ? { ...i, is_protected: makeProtected } : i));
    try {
      await api.put("/api/admin/parameter-master/items/bulk", { item_ids: ids, is_protected: makeProtected });
      setSelected(new Set());
    } catch (e) {
      // Rollback: reload from server
      await load();
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Bulk update failed");
    } finally {
      setBulkSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Parameter Master</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Mark items as <strong>Protected</strong> (never deleted during reconciliation) or
          <strong> Deletable</strong> (may be removed). Use checkboxes to select multiple items and apply in bulk.
        </p>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-muted-foreground">Protected:</span>
            <strong className="text-amber-600 dark:text-amber-400">{protectedCount}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Trash2 className="w-4 h-4 text-destructive" />
            <span className="text-muted-foreground">Deletable:</span>
            <strong className="text-destructive">{deletableCount}</strong>
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 rounded text-sm">{error}</div>
      )}

      {/* Bulk action bar */}
      {isSuperAdmin && selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 rounded-lg flex items-center gap-3 flex-wrap shadow">
          <span className="text-sm font-medium">
            {selected.size} item{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => bulkUpdate(true)}
              disabled={bulkSaving}
              className="bg-amber-500 hover:bg-amber-600 text-white border-none"
            >
              <ShieldCheck className="w-4 h-4 mr-1" />
              {bulkSaving ? "Saving…" : "Mark as Protected"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => bulkUpdate(false)}
              disabled={bulkSaving}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground border-none"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {bulkSaving ? "Saving…" : "Mark as Deletable"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={clearSelection}
              disabled={bulkSaving}
            >
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden divide-y">
        {/* Header row with "select all filtered" checkbox */}
        {isSuperAdmin && filtered.length > 0 && (
          <div className="px-4 py-2 bg-muted/50 flex items-center gap-3 text-xs text-muted-foreground">
            <Checkbox
              checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
              onCheckedChange={toggleSelectAllFiltered}
              aria-label="Select all items in current view"
            />
            <span>
              {allFilteredSelected
                ? `All ${filtered.length} visible item${filtered.length !== 1 ? "s" : ""} selected`
                : someFilteredSelected
                ? `${selectedFiltered.length} of ${filtered.length} visible selected`
                : `Select all ${filtered.length} visible item${filtered.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted-foreground text-sm">
            {items.length === 0 ? "No items found in the system." : "No items match your search."}
          </p>
        ) : (
          filtered.map(item => {
            const isSelected = selected.has(item.item_id);
            return (
              <div
                key={item.item_id}
                className={`px-4 py-3 flex items-center gap-3 ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}
              >
                {isSuperAdmin && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(item.item_id)}
                    aria-label={`Select ${item.item_name}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.item_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.is_protected
                      ? "Protected — this item will never be deleted"
                      : "Deletable — may be removed during reconciliation"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    item.is_protected
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                  }`}>
                    {item.is_protected ? "Protected" : "Deletable"}
                  </span>
                  <Switch
                    checked={item.is_protected}
                    disabled={!isSuperAdmin || saving === item.item_id || bulkSaving}
                    onCheckedChange={() => toggleOne(item)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isSuperAdmin && (
        <p className="text-xs text-muted-foreground italic">
          You have read-only access. Contact a System Administrator to change protection settings.
        </p>
      )}
    </div>
  );
}
