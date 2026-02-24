"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Item, Route, ItemRate, ItemRateCreate, ItemRateUpdate } from "@/types";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus } from "lucide-react";

interface ItemRateFormData {
  applicable_from_date: string;
  levy: string;
  rate: string;
  item_id: string;
  route_id: string;
  is_active: boolean;
}

const emptyForm: ItemRateFormData = {
  applicable_from_date: "",
  levy: "",
  rate: "",
  item_id: "",
  route_id: "",
  is_active: true,
};

function formatRouteLabel(r: Route): string {
  return r.branch_one_name && r.branch_two_name
    ? `${r.branch_one_name} - ${r.branch_two_name}`
    : `Route ${r.id}`;
}

export default function ItemRatesPage() {
  const [itemRates, setItemRates] = useState<ItemRate[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  // Pagination, sorting & filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [itemFilter, setItemFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRate, setEditingRate] = useState<ItemRate | null>(null);
  const [form, setForm] = useState<ItemRateFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // View modal state
  const [viewRate, setViewRate] = useState<ItemRate | null>(null);

  // Upcoming date modal state
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [upcomingDate, setUpcomingDate] = useState("");
  const [upcomingError, setUpcomingError] = useState("");
  const [upcomingSubmitting, setUpcomingSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const resp = await api.get<Item[]>("/api/items/?skip=0&limit=200&status=active&sort_by=name&sort_order=asc");
      setItems(resp.data);
    } catch {
      // items dropdown will be empty
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    try {
      const resp = await api.get<Route[]>("/api/routes/?skip=0&limit=200&status=active&sort_by=id&sort_order=asc");
      setRoutes(resp.data);
    } catch {
      // routes dropdown will be empty
    }
  }, []);

  const fetchItemRates = useCallback(async () => {
    setTableLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(pageSize),
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (itemFilter) params.set("item_filter", itemFilter);
      if (routeFilter) params.set("route_filter", routeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (fromDate) params.set("from_date", fromDate);

      const filterKeys = ["item_filter", "route_filter", "status", "from_date"];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<ItemRate[]>(`/api/item-rates/?${params}`),
        api.get<number>(`/api/item-rates/count?${countParams}`),
      ]);
      setItemRates(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load item rates.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, itemFilter, routeFilter, statusFilter, fromDate]);

  useEffect(() => {
    fetchItemRates();
    fetchItems();
    fetchRoutes();
  }, [fetchItemRates, fetchItems, fetchRoutes]);

  const openCreateModal = () => {
    setEditingRate(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (ir: ItemRate) => {
    setEditingRate(ir);
    setForm({
      applicable_from_date: ir.applicable_from_date ?? "",
      levy: ir.levy != null ? String(ir.levy) : "",
      rate: ir.rate != null ? String(ir.rate) : "",
      item_id: ir.item_id != null ? String(ir.item_id) : "",
      route_id: ir.route_id != null ? String(ir.route_id) : "",
      is_active: ir.is_active ?? true,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRate(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const itemId = parseInt(form.item_id);
    const routeId = parseInt(form.route_id);
    if (!itemId || !routeId) {
      setFormError("Please select both an item and a route.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingRate) {
        const update: ItemRateUpdate = {};
        if (itemId !== editingRate.item_id) update.item_id = itemId;
        if (routeId !== editingRate.route_id) update.route_id = routeId;
        const newDate = form.applicable_from_date || null;
        if (newDate !== editingRate.applicable_from_date) update.applicable_from_date = newDate;
        const newLevy = form.levy ? parseFloat(form.levy) : null;
        if (newLevy !== editingRate.levy) update.levy = newLevy;
        const newRate = form.rate ? parseFloat(form.rate) : null;
        if (newRate !== editingRate.rate) update.rate = newRate;
        if (form.is_active !== (editingRate.is_active ?? true)) update.is_active = form.is_active;
        await api.patch(`/api/item-rates/${editingRate.id}`, update);
      } else {
        const create: ItemRateCreate = {
          item_id: itemId,
          route_id: routeId,
          applicable_from_date: form.applicable_from_date || null,
          levy: form.levy ? parseFloat(form.levy) : null,
          rate: form.rate ? parseFloat(form.rate) : null,
        };
        await api.post("/api/item-rates/", create);
      }
      closeModal();
      await fetchItemRates();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Operation failed. Please try again.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpcomingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpcomingError("");
    if (!upcomingDate) {
      setUpcomingError("Please select a date.");
      return;
    }
    setUpcomingSubmitting(true);
    try {
      await api.post("/api/item-rates/bulk-upcoming", { applicable_from_date: upcomingDate });
      setShowUpcomingModal(false);
      await fetchItemRates();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Operation failed. Please try again.";
      setUpcomingError(msg);
    } finally {
      setUpcomingSubmitting(false);
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

  const hasActiveFilters = itemFilter || routeFilter || statusFilter || fromDate;

  const columns: Column<ItemRate>[] = [
    {
      key: "id",
      label: "ID",
      sortable: true,
      render: (ir) => <span className="text-muted-foreground">{ir.id}</span>,
    },
    {
      key: "item_id",
      label: "Item",
      sortable: true,
      render: (ir) => <span className="font-medium">{ir.item_name ?? ir.item_id}</span>,
    },
    {
      key: "route_id",
      label: "Route",
      sortable: true,
      render: (ir) => <span className="font-medium">{ir.route_name ?? ir.route_id}</span>,
    },
    {
      key: "rate",
      label: "Rate",
      sortable: true,
      className: "text-right",
      render: (ir) => (
        <span>{ir.rate != null ? ir.rate.toFixed(2) : "\u2014"}</span>
      ),
    },
    {
      key: "levy",
      label: "Levy",
      sortable: true,
      className: "text-right",
      render: (ir) => (
        <span>{ir.levy != null ? ir.levy.toFixed(2) : "\u2014"}</span>
      ),
    },
    {
      key: "applicable_from_date",
      label: "From Date",
      sortable: true,
      render: (ir) => <span>{ir.applicable_from_date ?? "\u2014"}</span>,
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      render: (ir) => (
        <Badge variant={ir.is_active ? "default" : "destructive"}>
          {ir.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (ir) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setViewRate(ir)}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(ir)}>
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
          <h1 className="text-2xl font-bold">Item Rate Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage rates and levies for items on specific routes
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4 mr-2" /> Add Item Rate
          </Button>
          <Button
            variant="outline"
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={() => {
              setUpcomingDate("");
              setUpcomingError("");
              setShowUpcomingModal(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Item Rates for Upcoming Date
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
            <div>
              <Label className="mb-1.5 block">Item</Label>
              <Select
                value={itemFilter || "all"}
                onValueChange={(v) => {
                  setItemFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Route</Label>
              <Select
                value={routeFilter || "all"}
                onValueChange={(v) => {
                  setRouteFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="All Routes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Routes</SelectItem>
                  {routes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {formatRouteLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Select
                value={statusFilter || "all"}
                onValueChange={(v) => {
                  setStatusFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
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
            <div>
              <Label className="mb-1.5 block">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-[160px]"
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setItemFilter("");
                  setRouteFilter("");
                  setStatusFilter("");
                  setFromDate("");
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
        data={itemRates}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No item rates found. Click "Add Item Rate" to create one.'
      />

      {/* View Modal */}
      <Dialog open={!!viewRate} onOpenChange={(open) => !open && setViewRate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Item Rate Details</DialogTitle>
          </DialogHeader>
          {viewRate && (
            <div className="space-y-3">
              {(
                [
                  ["ID", viewRate.id],
                  ["Item", viewRate.item_name ?? viewRate.item_id],
                  ["Route", viewRate.route_name ?? viewRate.route_id],
                  ["Rate", viewRate.rate != null ? viewRate.rate.toFixed(2) : "\u2014"],
                  ["Levy", viewRate.levy != null ? viewRate.levy.toFixed(2) : "\u2014"],
                  ["Applicable From", viewRate.applicable_from_date ?? "\u2014"],
                  [
                    "Status",
                    <Badge
                      key="status"
                      variant={viewRate.is_active ? "default" : "destructive"}
                    >
                      {viewRate.is_active ? "Active" : "Inactive"}
                    </Badge>,
                  ],
                ] as [string, React.ReactNode][]
              ).map(([label, value]) => (
                <div key={label as string} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewRate(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upcoming Date Modal */}
      <Dialog
        open={showUpcomingModal}
        onOpenChange={(open) => !open && setShowUpcomingModal(false)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Item Rates for Upcoming Date</DialogTitle>
            <DialogDescription>
              All active item rates will be duplicated with the new applicable date.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpcomingSubmit} className="space-y-4">
            <div>
              <Label>New Applicable From Date *</Label>
              <Input
                type="date"
                required
                value={upcomingDate}
                onChange={(e) => setUpcomingDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            {upcomingError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                {upcomingError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowUpcomingModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={upcomingSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {upcomingSubmitting ? "Creating..." : "Create Rates"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRate ? "Edit Item Rate" : "Add New Item Rate"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Item *</Label>
              <Select
                value={form.item_id || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, item_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select an item" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select an item</SelectItem>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Route *</Label>
              <Select
                value={form.route_id || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, route_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a route" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a route</SelectItem>
                  {routes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {formatRouteLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Rate</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="1.01"
                  placeholder="0.00"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Levy</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.levy}
                  onChange={(e) => setForm({ ...form, levy: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Applicable From Date</Label>
              <Input
                type="date"
                value={form.applicable_from_date}
                onChange={(e) =>
                  setForm({ ...form, applicable_from_date: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
            {editingRate && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive item rates are soft-deleted and hidden from normal
                    operations
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked })
                  }
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
                {submitting
                  ? "Saving..."
                  : editingRate
                    ? "Update Item Rate"
                    : "Create Item Rate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
