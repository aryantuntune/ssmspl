"use client";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import api from "@/lib/api";

interface UserAccess {
  user_id: string;
  full_name: string;
  username: string;
  is_granted: boolean;
  granted_at: string | null;
}

export default function UserAccessTab() {
  const [users, setUsers] = useState<UserAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = () =>
    api.get<UserAccess[]>("/api/admin/user-access")
      .then(r => setUsers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const toggle = async (u: UserAccess) => {
    setSaving(u.user_id);
    try {
      await api.put(`/api/admin/user-access/${u.user_id}`, { is_granted: !u.is_granted });
      await load();
    } catch {
      // silently ignore — load() will restore current state
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="py-6 text-muted-foreground text-sm">Loading users…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Admin Portal Access</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Grant or revoke access to the admin portal for each Admin user.
        </p>
      </div>
      <div className="border rounded-lg divide-y">
        {users.map(u => (
          <div key={u.user_id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-sm">{u.full_name}</p>
              <p className="text-xs text-muted-foreground">@{u.username}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {u.is_granted ? "Access granted" : "No access"}
              </span>
              <Switch
                checked={u.is_granted}
                disabled={saving === u.user_id}
                onCheckedChange={() => toggle(u)}
              />
            </div>
          </div>
        ))}
        {!users.length && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No Admin users found.
          </p>
        )}
      </div>
    </div>
  );
}
