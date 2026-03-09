"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Company, CompanyUpdate, DailyReportRecipient } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/ThemeProvider";
import { DEFAULT_THEMES } from "@/lib/themes";
import { Settings, Palette, Mail, Plus, Trash2, Power } from "lucide-react";

interface FormData {
  name: string;
  short_name: string;
  reg_address: string;
  gst_no: string;
  pan_no: string;
  tan_no: string;
  cin_no: string;
  contact: string;
  email: string;
  sf_item_id: string;
}

const emptyForm: FormData = {
  name: "",
  short_name: "",
  reg_address: "",
  gst_no: "",
  pan_no: "",
  tan_no: "",
  cin_no: "",
  contact: "",
  email: "",
  sf_item_id: "",
};

function companyToForm(c: Company): FormData {
  return {
    name: c.name || "",
    short_name: c.short_name || "",
    reg_address: c.reg_address || "",
    gst_no: c.gst_no || "",
    pan_no: c.pan_no || "",
    tan_no: c.tan_no || "",
    cin_no: c.cin_no || "",
    contact: c.contact || "",
    email: c.email || "",
    sf_item_id: c.sf_item_id != null ? String(c.sf_item_id) : "",
  };
}

export default function SettingsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { theme, mode, setThemeName, toggleMode } = useTheme();
  const [themeSubmitting, setThemeSubmitting] = useState(false);
  const [themeSuccess, setThemeSuccess] = useState("");

  // Daily report recipients state
  const [recipients, setRecipients] = useState<DailyReportRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(true);
  const [recipientsError, setRecipientsError] = useState("");
  const [recipientsSuccess, setRecipientsSuccess] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const fetchRecipients = useCallback(async () => {
    try {
      const { data } = await api.get<DailyReportRecipient[]>(
        "/api/settings/daily-report-recipients"
      );
      setRecipients(data);
      setRecipientsError("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to load recipients.";
      setRecipientsError(msg);
    } finally {
      setRecipientsLoading(false);
    }
  }, []);

  const handleAddRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail.trim()) return;

    setAddSubmitting(true);
    setRecipientsError("");
    setRecipientsSuccess("");
    try {
      await api.post("/api/settings/daily-report-recipients", {
        email: addEmail.trim(),
        label: addLabel.trim() || undefined,
      });
      setAddEmail("");
      setAddLabel("");
      await fetchRecipients();
      setRecipientsSuccess("Recipient added successfully.");
      setTimeout(() => setRecipientsSuccess(""), 3000);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      let msg: string;
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((e: { msg?: string }) => e.msg || "Validation error").join("; ");
      } else {
        msg = "Failed to add recipient.";
      }
      setRecipientsError(msg);
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleToggleRecipient = async (id: number) => {
    setTogglingId(id);
    setRecipientsError("");
    setRecipientsSuccess("");
    try {
      const { data: updated } = await api.patch<DailyReportRecipient>(
        `/api/settings/daily-report-recipients/${id}`
      );
      setRecipients((prev) =>
        prev.map((r) => (r.id === id ? updated : r))
      );
      setRecipientsSuccess(
        `Recipient ${updated.is_active ? "activated" : "deactivated"} successfully.`
      );
      setTimeout(() => setRecipientsSuccess(""), 3000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to update recipient.";
      setRecipientsError(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteRecipient = async (id: number) => {
    setDeletingId(id);
    setRecipientsError("");
    setRecipientsSuccess("");
    try {
      await api.delete(`/api/settings/daily-report-recipients/${id}`);
      setRecipients((prev) => prev.filter((r) => r.id !== id));
      setConfirmDeleteId(null);
      setRecipientsSuccess("Recipient removed successfully.");
      setTimeout(() => setRecipientsSuccess(""), 3000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to delete recipient.";
      setRecipientsError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { data: comp } = await api.get<Company>("/api/company/");
        setCompany(comp);
        setForm(companyToForm(comp));
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Failed to load company settings.";
        setError(detail);
      } finally {
        setLoading(false);
      }
    };
    init();
    fetchRecipients();
  }, [fetchRecipients]);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Company name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: CompanyUpdate = {};
      const original = company ? companyToForm(company) : emptyForm;

      if (form.name !== original.name) payload.name = form.name;
      if (form.short_name !== original.short_name) payload.short_name = form.short_name || null;
      if (form.reg_address !== original.reg_address) payload.reg_address = form.reg_address || null;
      if (form.gst_no !== original.gst_no) payload.gst_no = form.gst_no || null;
      if (form.pan_no !== original.pan_no) payload.pan_no = form.pan_no || null;
      if (form.tan_no !== original.tan_no) payload.tan_no = form.tan_no || null;
      if (form.cin_no !== original.cin_no) payload.cin_no = form.cin_no || null;
      if (form.contact !== original.contact) payload.contact = form.contact || null;
      if (form.email !== original.email) payload.email = form.email || null;
      if (form.sf_item_id !== original.sf_item_id) {
        payload.sf_item_id = form.sf_item_id.trim() ? parseInt(form.sf_item_id.trim(), 10) : null;
      }

      if (Object.keys(payload).length === 0) {
        setSuccess("No changes to save.");
        setSubmitting(false);
        return;
      }

      const { data: updated } = await api.patch<Company>("/api/company/", payload);
      setCompany(updated);
      setForm(companyToForm(updated));
      setSuccess("Company settings updated successfully.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to update company settings.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleThemeSave = async () => {
    setThemeSubmitting(true);
    setThemeSuccess("");
    try {
      await api.patch("/api/company/", { active_theme: theme.name });
      setThemeSuccess("Theme saved successfully.");
      setTimeout(() => setThemeSuccess(""), 3000);
    } catch {
      // Non-fatal — theme still applies locally
    } finally {
      setThemeSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Loading...
      </div>
    );
  }

  const fields: { key: keyof FormData; label: string; type?: string; required?: boolean; maxLength?: number; textarea?: boolean }[] = [
    { key: "name", label: "Company Name", required: true, maxLength: 255 },
    { key: "short_name", label: "Short Name", maxLength: 60 },
    { key: "reg_address", label: "Registered Address", maxLength: 500, textarea: true },
    { key: "gst_no", label: "GST No", maxLength: 15 },
    { key: "pan_no", label: "PAN No", maxLength: 10 },
    { key: "tan_no", label: "TAN No", maxLength: 10 },
    { key: "cin_no", label: "CIN No", maxLength: 21 },
    { key: "contact", label: "Contact", maxLength: 255 },
    { key: "email", label: "Email", type: "email", maxLength: 255 },
    { key: "sf_item_id", label: "Special Fare Item ID", type: "number" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View and update company information, theme preferences, and email settings
        </p>
      </div>

      {/* Company Information */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map(({ key, label, type, required, maxLength, textarea }) => (
              <div key={key}>
                <Label>{label}{required ? " *" : ""}</Label>
                {textarea ? (
                  <Textarea
                    value={form[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    maxLength={maxLength}
                    rows={3}
                    className="mt-1.5"
                  />
                ) : (
                  <Input
                    type={type || "text"}
                    required={required}
                    value={form[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    maxLength={maxLength}
                    className="mt-1.5"
                  />
                )}
              </div>
            ))}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                {error}
              </p>
            )}

            {success && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                {success}
              </p>
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Theme Management */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5" />
            Theme Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme selector */}
          <div>
            <Label className="mb-1.5 block">Color Theme</Label>
            <Select value={theme.name} onValueChange={setThemeName}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_THEMES.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Theme preview strip */}
          <div>
            <Label className="mb-1.5 block">Preview</Label>
            <div className="flex gap-2">
              {(() => {
                const colors = mode === "dark" ? theme.dark : theme.light;
                const swatches = [
                  { label: "Primary", value: colors.primary },
                  { label: "Sidebar", value: colors.sidebar },
                  { label: "Active", value: colors.sidebarActive },
                  { label: "Background", value: colors.background },
                  { label: "Muted", value: colors.muted },
                  { label: "Destructive", value: colors.destructive },
                ];
                return swatches.map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-1">
                    <div
                      className="h-8 w-8 rounded-md border border-border"
                      style={{ backgroundColor: `hsl(${s.value})` }}
                    />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Dark mode toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Dark Mode</Label>
              <p className="text-xs text-muted-foreground">
                Toggle between light and dark appearance
              </p>
            </div>
            <Switch
              checked={mode === "dark"}
              onCheckedChange={toggleMode}
            />
          </div>

          {themeSuccess && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
              {themeSuccess}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={handleThemeSave} disabled={themeSubmitting} variant="outline">
              {themeSubmitting ? "Saving..." : "Save Theme"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Daily Report Recipients */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            Daily Report Recipients
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Manage who receives the daily summary email at 11:59 PM
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add recipient form */}
          <form onSubmit={handleAddRecipient} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label className="mb-1.5 block">Email *</Label>
              <Input
                type="email"
                required
                placeholder="e.g. admin@ssmspl.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
              />
            </div>
            <div className="min-w-[140px]">
              <Label className="mb-1.5 block">Label</Label>
              <Input
                placeholder="e.g. CEO"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                maxLength={100}
              />
            </div>
            <Button type="submit" disabled={addSubmitting}>
              <Plus className="h-4 w-4 mr-2" />
              {addSubmitting ? "Adding..." : "Add"}
            </Button>
          </form>

          {recipientsError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
              {recipientsError}
            </p>
          )}

          {recipientsSuccess && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
              {recipientsSuccess}
            </p>
          )}

          {/* Recipients table */}
          {recipientsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading recipients...
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No recipients configured. Add an email address above.
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.email}</TableCell>
                      <TableCell>{r.label || "\u2014"}</TableCell>
                      <TableCell>
                        <Badge variant={r.is_active ? "default" : "secondary"}>
                          {r.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={togglingId === r.id}
                            onClick={() => handleToggleRecipient(r.id)}
                            title={r.is_active ? "Deactivate" : "Activate"}
                          >
                            <Power className="h-4 w-4 mr-1" />
                            {togglingId === r.id
                              ? "..."
                              : r.is_active
                                ? "Deactivate"
                                : "Activate"}
                          </Button>
                          {confirmDeleteId === r.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deletingId === r.id}
                                onClick={() => handleDeleteRecipient(r.id)}
                              >
                                {deletingId === r.id ? "..." : "Confirm"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteId(r.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
