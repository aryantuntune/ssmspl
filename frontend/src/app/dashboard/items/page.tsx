"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Item, ItemCreate, ItemUpdate } from "@/types";
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

interface ItemFormData {
  name: string;
  short_name: string;
  online_visibility: boolean;
  is_vehicle: boolean;
  is_active: boolean;
}

const emptyForm: ItemFormData = { name: "", short_name: "", online_visibility: false, is_vehicle: false, is_active: true };

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
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
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form, setForm] = useState<ItemFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [viewItem, setViewItem] = useState<Item | null>(null);

  const fetchItems = useCallback(async () => {
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
      if (visibilityFilter) params.set("online_visibility", visibilityFilter);
      if (vehicleFilter) params.set("is_vehicle", vehicleFilter);

      const filterKeys = ["search", "search_column", "match_type", "status", "online_visibility", "is_vehicle"];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<Item[]>(`/api/items/?${params}`),
        api.get<number>(`/api/items/count?${countParams}`),
      ]);
      setItems(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load items.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, search, statusFilter, visibilityFilter, vehicleFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openCreateModal = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (item: Item) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      short_name: item.short_name,
      online_visibility: item.online_visibility ?? false,
      is_vehicle: item.is_vehicle ?? false,
      is_active: item.is_active ?? true,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      if (editingItem) {
        const update: ItemUpdate = {};
        if (form.name !== editingItem.name) update.name = form.name;
        if (form.short_name !== editingItem.short_name) update.short_name = form.short_name;
        if (form.online_visibility !== (editingItem.online_visibility ?? false))
          update.online_visibility = form.online_visibility;
        if (form.is_vehicle !== (editingItem.is_vehicle ?? false))
          update.is_vehicle = form.is_vehicle;
        if (form.is_active !== (editingItem.is_active ?? true))
          update.is_active = form.is_active;
        await api.patch(`/api/items/${editingItem.id}`, update);
      } else {
        const create: ItemCreate = { name: form.name, short_name: form.short_name };
        if (form.online_visibility) create.online_visibility = form.online_visibility;
        if (form.is_vehicle) create.is_vehicle = form.is_vehicle;
        await api.post("/api/items/", create);
      }
      closeModal();
      await fetchItems();
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

  const columns: Column<Item>[] = [
    { key: "id", label: "ID", sortable: true },
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (i) => <span className="font-medium">{i.name}</span>,
    },
    { key: "short_name", label: "Short Name", sortable: true },
    {
      key: "online_visibility",
      label: "Online",
      sortable: true,
      render: (i) => (
        <Badge variant={i.online_visibility ? "default" : "secondary"}>
          {i.online_visibility ? "Visible" : "Hidden"}
        </Badge>
      ),
    },
    {
      key: "is_vehicle",
      label: "Vehicle",
      sortable: true,
      render: (i) => (
        <Badge variant={i.is_vehicle ? "outline" : "secondary"}>
          {i.is_vehicle ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      render: (i) => (
        <Badge variant={i.is_active ? "default" : "destructive"}>
          {i.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (i) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setViewItem(i)}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(i)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  const hasFilters = searchInput || statusFilter || visibilityFilter || vehicleFilter;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Item Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage ticket item types in the system
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" /> Add Item
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
                  placeholder="Search by name or short name..."
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
              <Label className="mb-1.5 block">Visibility</Label>
              <Select value={visibilityFilter} onValueChange={(v) => { setVisibilityFilter(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[120px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="visible">Visible</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Vehicle</Label>
              <Select value={vehicleFilter} onValueChange={(v) => { setVehicleFilter(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[100px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
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
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setStatusFilter("");
                  setVisibilityFilter("");
                  setVehicleFilter("");
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
        data={items}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No items found. Click "Add Item" to create one.'
      />

      {/* View Modal */}
      <Dialog open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Item Details</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              {([
                ["ID", viewItem.id],
                ["Name", viewItem.name],
                ["Short Name", viewItem.short_name],
              ] as [string, string | number][]).map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Online Visibility</span>
                <Badge variant={viewItem.online_visibility ? "default" : "secondary"}>
                  {viewItem.online_visibility ? "Visible" : "Hidden"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Vehicle</span>
                <Badge variant={viewItem.is_vehicle ? "outline" : "secondary"}>
                  {viewItem.is_vehicle ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={viewItem.is_active ? "default" : "destructive"}>
                  {viewItem.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewItem(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Item Name *</Label>
              <Input
                required
                maxLength={60}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Adult Passenger"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Short Name *</Label>
              <Input
                required
                maxLength={30}
                value={form.short_name}
                onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                placeholder="e.g. Adult"
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <Label>Online Visibility</Label>
                <p className="text-xs text-muted-foreground">
                  Whether this item is visible for online booking
                </p>
              </div>
              <Switch
                checked={form.online_visibility}
                onCheckedChange={(checked) => setForm({ ...form, online_visibility: checked })}
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <Label>Vehicle</Label>
                <p className="text-xs text-muted-foreground">
                  Whether this item is a vehicle type
                </p>
              </div>
              <Switch
                checked={form.is_vehicle}
                onCheckedChange={(checked) => setForm({ ...form, is_vehicle: checked })}
              />
            </div>
            {editingItem && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive items are soft-deleted and hidden from normal operations
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
                {submitting ? "Saving..." : editingItem ? "Update Item" : "Create Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
