"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";

interface ScreenToggle {
  id: number;
  screen_name: string;
  is_enabled: boolean;
}

export default function ScreenAccessTab() {
  const [toggles, setToggles] = useState<ScreenToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<ScreenToggle[]>(
          "/api/settings/screen-toggles"
        );
        setToggles(data);
      } catch {
        setError("Failed to load screen toggles.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = async (screenName: string, checked: boolean) => {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const { data } = await api.put<ScreenToggle[]>(
        "/api/settings/screen-toggles",
        { toggles: { [screenName]: checked } }
      );
      setToggles(data);
      setSuccess(
        `${screenName} ${checked ? "enabled" : "disabled"} for admin users.`
      );
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to update screen toggle.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5" />
          Admin Screen Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Control which screens are visible to admin users on the admin portal.
          Dashboard and System Settings are always visible and cannot be turned
          off.
        </p>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : toggles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No toggleable screens found.
          </p>
        ) : (
          <div className="space-y-3">
            {toggles.map((toggle) => (
              <div
                key={toggle.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`screen-${toggle.id}`}
                    className="text-sm font-medium"
                  >
                    {toggle.screen_name}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {toggle.is_enabled
                      ? "Visible to admin users"
                      : "Hidden from admin users"}
                  </p>
                </div>
                <Switch
                  id={`screen-${toggle.id}`}
                  checked={toggle.is_enabled}
                  onCheckedChange={(checked) =>
                    handleToggle(toggle.screen_name, checked)
                  }
                  disabled={saving}
                />
              </div>
            ))}
          </div>
        )}

        {success && (
          <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded p-2 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
            {success}
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
