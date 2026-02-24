"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Branch, BranchCreate, BranchUpdate } from "@/types";
import DataTable, { Column } from "@/components/dashboard/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Printer, FileText, FileSpreadsheet } from "lucide-react";

interface BranchFormData {
  name: string;
  address: string;
  contact_nos: string;
  latitude: string;
  longitude: string;
  sf_after: string;
  sf_before: string;
  is_active: boolean;
}

const emptyForm: BranchFormData = { name: "", address: "", contact_nos: "", latitude: "", longitude: "", sf_after: "", sf_before: "", is_active: true };

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [viewBranch, setViewBranch] = useState<Branch | null>(null);

  const fetchBranches = useCallback(async () => {
    setTableLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(pageSize),
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (search.trim()) {
        params.set("search", search.trim());
        params.set("search_column", "all");
        params.set("match_type", "contains");
      }
      if (statusFilter) params.set("status", statusFilter);

      const filterKeys = ["search", "search_column", "match_type", "status"];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<Branch[]>(`/api/branches/?${params}`),
        api.get<number>(`/api/branches/count?${countParams}`),
      ]);
      setBranches(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load branches.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, search, statusFilter]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const openCreateModal = () => {
    setEditingBranch(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      address: branch.address,
      contact_nos: branch.contact_nos ?? "",
      latitude: branch.latitude != null ? String(branch.latitude) : "",
      longitude: branch.longitude != null ? String(branch.longitude) : "",
      sf_after: branch.sf_after ?? "",
      sf_before: branch.sf_before ?? "",
      is_active: branch.is_active ?? true,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBranch(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      if (editingBranch) {
        const update: BranchUpdate = {};
        if (form.name !== editingBranch.name) update.name = form.name;
        if (form.address !== editingBranch.address) update.address = form.address;
        const formContactNos = form.contact_nos || undefined;
        const editContactNos = editingBranch.contact_nos || undefined;
        if (formContactNos !== editContactNos) update.contact_nos = form.contact_nos || undefined;
        const formLat = form.latitude ? parseFloat(form.latitude) : undefined;
        const editLat = editingBranch.latitude ?? undefined;
        if (formLat !== editLat) update.latitude = formLat;
        const formLng = form.longitude ? parseFloat(form.longitude) : undefined;
        const editLng = editingBranch.longitude ?? undefined;
        if (formLng !== editLng) update.longitude = formLng;
        const formSfAfter = form.sf_after || null;
        const editSfAfter = editingBranch.sf_after || null;
        if (formSfAfter !== editSfAfter) update.sf_after = formSfAfter;
        const formSfBefore = form.sf_before || null;
        const editSfBefore = editingBranch.sf_before || null;
        if (formSfBefore !== editSfBefore) update.sf_before = formSfBefore;
        if (form.is_active !== (editingBranch.is_active ?? true))
          update.is_active = form.is_active;
        await api.patch(`/api/branches/${editingBranch.id}`, update);
      } else {
        const create: BranchCreate = { name: form.name, address: form.address };
        if (form.contact_nos) create.contact_nos = form.contact_nos;
        if (form.latitude) create.latitude = parseFloat(form.latitude);
        if (form.longitude) create.longitude = parseFloat(form.longitude);
        if (form.sf_after) create.sf_after = form.sf_after;
        if (form.sf_before) create.sf_before = form.sf_before;
        await api.post("/api/branches/", create);
      }
      closeModal();
      await fetchBranches();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Operation failed. Please try again.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  // --- Export helpers ---
  const fetchAllBranches = async (): Promise<Branch[]> => {
    const params = new URLSearchParams({ sort_by: sortBy, sort_order: sortOrder });
    if (search.trim()) {
      params.set("search", search.trim());
      params.set("search_column", "all");
      params.set("match_type", "contains");
    }
    if (statusFilter) params.set("status", statusFilter);
    const resp = await api.get<Branch[]>(`/api/branches/export?${params}`);
    return resp.data;
  };

  const formatRows = (data: Branch[]) =>
    data.map((b) => [b.id, b.name, b.address, b.contact_nos ?? "\u2014", b.is_active ? "Active" : "Inactive"]);

  const EXPORT_HEADERS = ["ID", "Name", "Address", "Contact Nos", "Status"];

  const handlePrint = async () => {
    try {
      const data = await fetchAllBranches();
      const rows = formatRows(data);
      const html = `<!DOCTYPE html>
<html><head><title>SSMSPL - Branch List</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
  h1 { font-size: 18px; margin: 0; }
  .sub { font-size: 12px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f3f4f6; text-align: left; padding: 8px 12px; border: 1px solid #d1d5db; font-weight: 600; }
  td { padding: 8px 12px; border: 1px solid #d1d5db; }
  tr:nth-child(even) { background: #f9fafb; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>SSMSPL - Branch List</h1>
<div class="sub">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} &bull; ${data.length} record(s)</div>
<table><thead><tr>${EXPORT_HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>
</body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    } catch {
      setError("Failed to fetch data for printing.");
    }
  };

  const handleExportPDF = async () => {
    try {
      const data = await fetchAllBranches();
      const rows = formatRows(data);
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(16);
      doc.text("SSMSPL - Branch List", 14, 15);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}  |  ${data.length} record(s)`, 14, 22);
      autoTable(doc, {
        startY: 28,
        head: [EXPORT_HEADERS],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 64, 175] },
      });
      doc.save("branches.pdf");
    } catch {
      setError("Failed to generate PDF.");
    }
  };

  const handleExportExcel = async () => {
    try {
      const data = await fetchAllBranches();
      const rows = formatRows(data);
      const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows]);
      ws["!cols"] = [{ wch: 5 }, { wch: 15 }, { wch: 35 }, { wch: 20 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Branches");
      XLSX.writeFile(wb, "branches.xlsx");
    } catch {
      setError("Failed to generate Excel file.");
    }
  };

  const columns: Column<Branch>[] = [
    { key: "id", label: "ID", sortable: true },
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (b) => <span className="font-medium">{b.name}</span>,
    },
    { key: "address", label: "Address", sortable: true },
    {
      key: "contact_nos",
      label: "Contact Nos",
      sortable: true,
      render: (b) => <span>{b.contact_nos ?? "\u2014"}</span>,
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      render: (b) => (
        <Badge variant={b.is_active ? "default" : "destructive"}>
          {b.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (b) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setViewBranch(b)}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(b)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Branch Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage branches and jetty locations in the system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-1.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
          </Button>
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4 mr-2" /> Add Branch
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Label className="mb-1.5 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, address, or contact..."
                  value={searchInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchInput(val);
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    debounceRef.current = setTimeout(() => {
                      setSearch(val);
                      setPage(1);
                    }, 400);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[120px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(searchInput || statusFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchInput(""); setSearch(""); setStatusFilter(""); setPage(1); }}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={branches}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No branches found. Click "Add Branch" to create one.'
      />

      {/* View Modal */}
      <Dialog open={!!viewBranch} onOpenChange={(open) => !open && setViewBranch(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Branch Details</DialogTitle>
          </DialogHeader>
          {viewBranch && (
            <div className="space-y-3">
              {([
                ["ID", viewBranch.id],
                ["Name", viewBranch.name],
                ["Address", viewBranch.address],
                ["Contact Nos", viewBranch.contact_nos ?? "\u2014"],
                ["Latitude", viewBranch.latitude != null ? viewBranch.latitude : "\u2014"],
                ["Longitude", viewBranch.longitude != null ? viewBranch.longitude : "\u2014"],
                ["SF After", viewBranch.sf_after ?? "\u2014"],
                ["SF Before", viewBranch.sf_before ?? "\u2014"],
              ] as [string, string | number][]).map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={viewBranch.is_active ? "default" : "destructive"}>
                  {viewBranch.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewBranch(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Edit Branch" : "Add New Branch"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Branch Name *</Label>
              <Input
                required
                maxLength={15}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Old Goa"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Address *</Label>
              <Input
                required
                maxLength={255}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. Old Goa Jetty, Goa 403402"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Contact Numbers</Label>
              <Input
                maxLength={255}
                value={form.contact_nos}
                onChange={(e) => setForm({ ...form, contact_nos: e.target.value })}
                placeholder="e.g. 0832-2456789"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                  placeholder="e.g. 15.50133"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                  placeholder="e.g. 73.91109"
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>SF After</Label>
                <Input
                  type="time"
                  step="1"
                  value={form.sf_after}
                  onChange={(e) => setForm({ ...form, sf_after: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>SF Before</Label>
                <Input
                  type="time"
                  step="1"
                  value={form.sf_before}
                  onChange={(e) => setForm({ ...form, sf_before: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            {editingBranch && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive branches are soft-deleted and hidden from normal operations
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
              </div>
            )}
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingBranch ? "Update Branch" : "Create Branch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
