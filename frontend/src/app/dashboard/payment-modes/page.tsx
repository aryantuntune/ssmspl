"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { PaymentMode, PaymentModeCreate, PaymentModeUpdate } from "@/types";
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
import { Plus, Search } from "lucide-react";

interface PaymentModeFormData {
  description: string;
  is_active: boolean;
}

const emptyForm: PaymentModeFormData = { description: "", is_active: true };

export default function PaymentModesPage() {
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
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
  const [editingPaymentMode, setEditingPaymentMode] = useState<PaymentMode | null>(null);
  const [form, setForm] = useState<PaymentModeFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [viewPaymentMode, setViewPaymentMode] = useState<PaymentMode | null>(null);

  const fetchPaymentModes = useCallback(async () => {
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
        api.get<PaymentMode[]>(`/api/payment-modes/?${params}`),
        api.get<number>(`/api/payment-modes/count?${countParams}`),
      ]);
      setPaymentModes(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load payment modes.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, search, statusFilter]);

  useEffect(() => {
    fetchPaymentModes();
  }, [fetchPaymentModes]);

  const openCreateModal = () => {
    setEditingPaymentMode(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (pm: PaymentMode) => {
    setEditingPaymentMode(pm);
    setForm({
      description: pm.description,
      is_active: pm.is_active,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPaymentMode(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      if (editingPaymentMode) {
        const update: PaymentModeUpdate = {};
        if (form.description !== editingPaymentMode.description) update.description = form.description;
        if (form.is_active !== editingPaymentMode.is_active)
          update.is_active = form.is_active;
        await api.patch(`/api/payment-modes/${editingPaymentMode.id}`, update);
      } else {
        const create: PaymentModeCreate = { description: form.description };
        await api.post("/api/payment-modes/", create);
      }
      closeModal();
      await fetchPaymentModes();
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

  const columns: Column<PaymentMode>[] = [
    { key: "id", label: "ID", sortable: true },
    {
      key: "description",
      label: "Description",
      sortable: true,
      render: (pm) => <span className="font-medium">{pm.description}</span>,
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      render: (pm) => (
        <Badge variant={pm.is_active ? "default" : "destructive"}>
          {pm.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (pm) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setViewPaymentMode(pm)}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(pm)}>
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
          <h1 className="text-2xl font-bold">Payment Mode Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage payment modes available in the system
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" /> Add Payment Mode
        </Button>
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
                  placeholder="Search by description..."
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setStatusFilter("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={paymentModes}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No payment modes found. Click "Add Payment Mode" to create one.'
      />

      {/* View Modal */}
      <Dialog open={!!viewPaymentMode} onOpenChange={(open) => !open && setViewPaymentMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Mode Details</DialogTitle>
          </DialogHeader>
          {viewPaymentMode && (
            <div className="space-y-3">
              {([
                ["ID", viewPaymentMode.id],
                ["Description", viewPaymentMode.description],
              ] as [string, string | number][]).map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={viewPaymentMode.is_active ? "default" : "destructive"}>
                  {viewPaymentMode.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewPaymentMode(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPaymentMode ? "Edit Payment Mode" : "Add New Payment Mode"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Description *</Label>
              <Input
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Cash"
                className="mt-1.5"
              />
            </div>
            {editingPaymentMode && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive payment modes are soft-deleted and hidden from normal operations
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
                {submitting ? "Saving..." : editingPaymentMode ? "Update Payment Mode" : "Create Payment Mode"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
