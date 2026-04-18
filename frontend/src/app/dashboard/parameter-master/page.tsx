"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import api from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";
import RuleTable from "./components/RuleTable";
import RuleModal from "./components/RuleModal";
import PreviewModal from "./components/PreviewModal";

const today = new Date().toISOString().slice(0, 10);

interface Rule {
  id: number;
  priority_order: number;
  branch_scope: number | null;
  item_id: number | null;
  payment_mode: string;
  ticket_conditions: Record<string, unknown>;
  item_conditions: Record<string, unknown>;
  ticket_selection_order: string;
  max_adjustment_per_ticket: number | null;
  max_adjustment_per_item: number | null;
  max_total_adjustment_per_rule: number | null;
  stop_on_match: boolean;
  is_active: boolean;
}

export default function ParameterMasterPage() {
  const user = useDashboardUser();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [rules, setRules] = useState<Rule[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [previewRuleId, setPreviewRuleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRules = () =>
    api.get<Rule[]>("/api/admin/parameter-master").then(r => setRules(r.data));

  useEffect(() => {
    Promise.all([
      api.get("/api/branches").then(r => setBranches(r.data?.branches ?? r.data ?? [])),
      api.get("/api/items").then(r => setItems(r.data?.items ?? r.data ?? [])),
      loadRules(),
    ]).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (rule: Rule) => {
    await api.patch(`/api/admin/parameter-master/${rule.id}/status`, { is_active: !rule.is_active });
    await loadRules();
  };

  if (loading) return <div className="py-10 text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Parameter Master</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Adjustment rules — applied in priority order during reconciliation
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Rule
          </Button>
        )}
      </div>

      <RuleTable
        rules={rules}
        isSuperAdmin={isSuperAdmin}
        branches={branches}
        items={items}
        onEdit={rule => setEditingRule(rule)}
        onToggle={handleToggle}
        onPreview={id => setPreviewRuleId(id)}
      />

      {(showCreate || editingRule) && (
        <RuleModal
          rule={editingRule}
          branches={branches}
          items={items}
          onSaved={async () => {
            await loadRules();
            setShowCreate(false);
            setEditingRule(null);
          }}
          onClose={() => { setShowCreate(false); setEditingRule(null); }}
        />
      )}

      <PreviewModal
        ruleId={previewRuleId}
        branchId="all"
        dateStart={today}
        dateEnd={today}
        onClose={() => setPreviewRuleId(null)}
      />
    </div>
  );
}
