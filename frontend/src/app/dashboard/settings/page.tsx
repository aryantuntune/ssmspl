"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Company, CompanyUpdate } from "@/types";

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
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        Loading...
      </div>
    );
  }

  const fields: { key: keyof FormData; label: string; type?: string; required?: boolean; maxLength?: number }[] = [
    { key: "name", label: "Company Name", required: true, maxLength: 255 },
    { key: "short_name", label: "Short Name", maxLength: 60 },
    { key: "reg_address", label: "Registered Address", maxLength: 500 },
    { key: "gst_no", label: "GST No", maxLength: 15 },
    { key: "pan_no", label: "PAN No", maxLength: 10 },
    { key: "tan_no", label: "TAN No", maxLength: 10 },
    { key: "cin_no", label: "CIN No", maxLength: 21 },
    { key: "contact", label: "Contact", maxLength: 255 },
    { key: "email", label: "Email", type: "email", maxLength: 255 },
    { key: "sf_item_id", label: "Special Fare Item ID", type: "number" },
  ];

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">System Settings</h2>
        <p className="text-gray-500 text-sm mt-1">
          View and update company information
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-2xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(({ key, label, type, required, maxLength }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}{required ? " *" : ""}
              </label>
              {key === "reg_address" ? (
                <textarea
                  value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  maxLength={maxLength}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <input
                  type={type || "text"}
                  required={required}
                  value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  maxLength={maxLength}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          ))}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}

          {success && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-2">
              {success}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
