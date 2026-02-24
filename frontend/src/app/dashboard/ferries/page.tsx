"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Boat, BoatCreate, BoatUpdate } from "@/types";
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

interface BoatFormData {
  name: string;
  no: string;
  is_active: boolean;
}

const emptyForm: BoatFormData = { name: "", no: "", is_active: true };

export default function FerriesPage() {
  const [boats, setBoats] = useState<Boat[]>([]);
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
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null);
  const [form, setForm] = useState<BoatFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchBoats = useCallback(async () => {
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
        api.get<Boat[]>(`/api/boats/?${params}`),
        api.get<number>(`/api/boats/count?${countParams}`),
      ]);
      setBoats(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load boats.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, search, statusFilter]);

  useEffect(() => {
    fetchBoats();
  }, [fetchBoats]);

  const openCreateModal = () => {
    setEditingBoat(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (boat: Boat) => {
    setEditingBoat(boat);
    setForm({ name: boat.name, no: boat.no, is_active: boat.is_active ?? true });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBoat(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      if (editingBoat) {
        const update: BoatUpdate = {};
        if (form.name !== editingBoat.name) update.name = form.name;
        if (form.no !== editingBoat.no) update.no = form.no;
        if (form.is_active !== (editingBoat.is_active ?? true))
          update.is_active = form.is_active;
        await api.patch(`/api/boats/${editingBoat.id}`, update);
      } else {
        const create: BoatCreate = { name: form.name, no: form.no };
        await api.post("/api/boats/", create);
      }
      closeModal();
      await fetchBoats();
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

  const columns: Column<Boat>[] = [
    { key: "id", label: "ID", sortable: true },
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (b) => <span className="font-medium">{b.name}</span>,
    },
    { key: "no", label: "Number", sortable: true },
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
        <div className="flex justify-end">
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
          <h1 className="text-2xl font-bold">Ferry Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage boats and ferries in the system
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" /> Add Boat
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
                  placeholder="Search by name or number..."
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
        data={boats}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No boats found. Click "Add Boat" to register one.'
      />

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBoat ? "Edit Boat" : "Add New Boat"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Boat Name *</Label>
              <Input
                required
                minLength={5}
                maxLength={30}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. SHANTADURGA (5-30 chars)"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Boat Number *</Label>
              <Input
                required
                minLength={10}
                maxLength={30}
                value={form.no}
                onChange={(e) => setForm({ ...form, no: e.target.value })}
                placeholder="e.g. RTN-IV-03-00001 (10-30 chars)"
                className="mt-1.5"
              />
            </div>
            {editingBoat && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive boats are soft-deleted and hidden from normal operations
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
                {submitting ? "Saving..." : editingBoat ? "Update Boat" : "Create Boat"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
