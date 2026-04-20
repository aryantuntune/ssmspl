"use client";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Search, ShieldCheck, Trash2 } from "lucide-react";
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
  const [error, setError] = useState("");

  const load = () =>
    api.get<Item[]>("/api/admin/parameter-master/items")
      .then(r => setItems(r.data))
      .catch(() => setError("Could not load items"))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const toggle = async (item: Item) => {
    if (!isSuperAdmin) return;
    const newValue = !item.is_protected;
    setSaving(item.item_id);
    setError("");
    // Optimistic update
    setItems(prev => prev.map(i => i.item_id === item.item_id ? { ...i, is_protected: newValue } : i));
    try {
      await api.put(`/api/admin/parameter-master/items/${item.item_id}`, { is_protected: newValue });
    } catch (e) {
      // Rollback on error
      setItems(prev => prev.map(i => i.item_id === item.item_id ? { ...i, is_protected: item.is_protected } : i));
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const filtered = items.filter(i => i.item_name.toLowerCase().includes(search.toLowerCase()));
  const protectedCount = items.filter(i => i.is_protected).length;
  const deletableCount = items.length - protectedCount;

  if (loading) return <div className="py-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Parameter Master</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Mark items as <strong>Protected</strong> (never deleted during reconciliation) or
          <strong> Deletable</strong> (may be removed). Toggle changes are saved immediately.
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

      <div className="border rounded-lg overflow-hidden divide-y">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted-foreground text-sm">
            {items.length === 0 ? "No items found in the system." : "No items match your search."}
          </p>
        ) : (
          filtered.map(item => (
            <div key={item.item_id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30">
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
                  disabled={!isSuperAdmin || saving === item.item_id}
                  onCheckedChange={() => toggle(item)}
                />
              </div>
            </div>
          ))
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
