"use client";
import { useEffect, useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ShieldCheck, Trash2, X, Repeat } from "lucide-react";
import api from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";
import TransferAllowList from "./components/TransferAllowList";

interface Item {
  item_id: number;
  item_name: string;
  is_protected: boolean;
  is_active: boolean;
}

type Tab = "reconciliation" | "transfer";

export default function ParameterMasterPage() {
  const user = useDashboardUser();
  const canEdit = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const [tab, setTab] = useState<Tab>("reconciliation");

  // Reconciliation tab state (preserves existing behavior)
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = () =>
    api.get<Item[]>("/api/admin/parameter-master/items")
      .then(r => setItems(r.data))
      .catch(() => setError("Could not load items"))
      .finally(() => setLoading(false));

  useEffect(() => {
    if (tab === "reconciliation") load();
  }, [tab]);

  // When hiding inactive items, drop them from the selection so bulk actions
  // can't silently mutate items the user can no longer see.
  useEffect(() => {
    if (showInactive) return;
    setSelected(prev => {
      const inactiveIds = new Set(items.filter(i => !i.is_active).map(i => i.item_id));
      if (inactiveIds.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const id of inactiveIds) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [showInactive, items]);

  const filtered = useMemo(
    () => items.filter(i =>
      (showInactive || i.is_active) &&
      i.item_name.toLowerCase().includes(search.toLowerCase())
    ),
    [items, search, showInactive],
  );
  const visibleItems = useMemo(
    () => items.filter(i => showInactive || i.is_active),
    [items, showInactive],
  );
  const protectedCount = visibleItems.filter(i => i.is_protected).length;
  const deletableCount = visibleItems.length - protectedCount;
  const inactiveCount = items.filter(i => !i.is_active).length;
  const filteredIds = useMemo(() => filtered.map(i => i.item_id), [filtered]);
  const selectedFiltered = filteredIds.filter(id => selected.has(id));
  const allFilteredSelected = filtered.length > 0 && selectedFiltered.length === filtered.length;
  const someFilteredSelected = selectedFiltered.length > 0 && !allFilteredSelected;

  const toggleOne = async (item: Item) => {
    if (!canEdit) return;
    const newValue = !item.is_protected;
    setSaving(item.item_id); setError("");
    setItems(prev => prev.map(i => i.item_id === item.item_id ? { ...i, is_protected: newValue } : i));
    try { await api.put(`/api/admin/parameter-master/items/${item.item_id}`, { is_protected: newValue }); }
    catch (e) {
      setItems(prev => prev.map(i => i.item_id === item.item_id ? { ...i, is_protected: item.is_protected } : i));
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Save failed");
    } finally { setSaving(null); }
  };

  const toggleSelect = (id: number) => setSelected(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) setSelected(prev => { const n = new Set(prev); for (const id of filteredIds) n.delete(id); return n; });
    else setSelected(prev => { const n = new Set(prev); for (const id of filteredIds) n.add(id); return n; });
  };
  const clearSelection = () => setSelected(new Set());
  const bulkUpdate = async (makeProtected: boolean) => {
    if (!canEdit || selected.size === 0) return;
    const ids = Array.from(selected);
    setBulkSaving(true); setError("");
    setItems(prev => prev.map(i => selected.has(i.item_id) ? { ...i, is_protected: makeProtected } : i));
    try {
      await api.put("/api/admin/parameter-master/items/bulk", { item_ids: ids, is_protected: makeProtected });
      setSelected(new Set());
    } catch (e) {
      await load();
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Bulk update failed");
    } finally { setBulkSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Parameter Master</h1>
        <p className="text-muted-foreground text-sm mt-1">Configuration for D Drive reconciliation operations.</p>
      </div>

      <div className="border-b flex gap-1">
        <button
          onClick={() => setTab("reconciliation")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === "reconciliation"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldCheck className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Reconciliation
        </button>
        <button
          onClick={() => setTab("transfer")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === "transfer"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Repeat className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Transfer Items
        </button>
      </div>

      {tab === "transfer" ? (
        <TransferAllowList />
      ) : loading ? (
        <div className="py-10 text-muted-foreground">Loading…</div>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Mark items as <strong>Protected</strong> (never deleted during reconciliation) or
            <strong> Deletable</strong>. Toggle changes are saved immediately.
          </p>

          <div className="flex items-center gap-6 flex-wrap">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(v === true)} />
              <span className="text-muted-foreground">
                Show inactive items {inactiveCount > 0 && <span className="text-xs">({inactiveCount})</span>}
              </span>
            </label>
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

          {error && <div className="bg-destructive/10 text-destructive px-4 py-2 rounded text-sm">{error}</div>}

          {canEdit && selected.size > 0 && (
            <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 rounded-lg flex items-center gap-3 flex-wrap shadow">
              <span className="text-sm font-medium">{selected.size} item{selected.size !== 1 ? "s" : ""} selected</span>
              <div className="flex gap-2 ml-auto flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => bulkUpdate(true)} disabled={bulkSaving} className="bg-amber-500 hover:bg-amber-600 text-white border-none">
                  <ShieldCheck className="w-4 h-4 mr-1" /> {bulkSaving ? "Saving…" : "Mark as Protected"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => bulkUpdate(false)} disabled={bulkSaving} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground border-none">
                  <Trash2 className="w-4 h-4 mr-1" /> {bulkSaving ? "Saving…" : "Mark as Deletable"}
                </Button>
                <Button size="sm" variant="secondary" onClick={clearSelection} disabled={bulkSaving}><X className="w-4 h-4 mr-1" /> Clear</Button>
              </div>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden divide-y">
            {canEdit && filtered.length > 0 && (
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
              </div>
            )}

            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted-foreground text-sm">
                {items.length === 0
                  ? "No items found."
                  : (() => {
                      const q = search.toLowerCase();
                      const hiddenMatches = !showInactive
                        ? items.filter(i => !i.is_active && i.item_name.toLowerCase().includes(q)).length
                        : 0;
                      if (hiddenMatches > 0) {
                        return `No active items match. ${hiddenMatches} inactive item${hiddenMatches !== 1 ? "s" : ""} match — enable "Show inactive items" to see ${hiddenMatches !== 1 ? "them" : "it"}.`;
                      }
                      return "No items match your search.";
                    })()
                }
              </p>
            ) : (
              filtered.map(item => {
                const isSelected = selected.has(item.item_id);
                return (
                  <div key={item.item_id} className={`px-4 py-3 flex items-center gap-3 ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                    {canEdit && (
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(item.item_id)} aria-label={`Select ${item.item_name}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium flex items-center gap-2">
                        <span className={!item.is_active ? "text-muted-foreground" : ""}>{item.item_name}</span>
                        {!item.is_active && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inactive</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.is_protected ? "Protected — never deleted" : "Deletable — may be removed"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        item.is_protected ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}>{item.is_protected ? "Protected" : "Deletable"}</span>
                      <Switch
                        checked={item.is_protected}
                        disabled={!canEdit || saving === item.item_id || bulkSaving}
                        onCheckedChange={() => toggleOne(item)}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {!canEdit && (
            <p className="text-xs text-muted-foreground italic">
              You have read-only access. Contact a System Administrator to change protection settings.
            </p>
          )}
        </>
      )}
    </div>
  );
}
