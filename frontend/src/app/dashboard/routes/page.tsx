"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Branch, Route, RouteCreate, RouteUpdate } from "@/types";
import DataTable, { Column } from "@/components/dashboard/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Plus } from "lucide-react";

interface RouteFormData {
  branch_id_one: string;
  branch_id_two: string;
  is_active: boolean;
}

const emptyForm: RouteFormData = {
  branch_id_one: "",
  branch_id_two: "",
  is_active: true,
};

export default function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  // Pagination, sorting & filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [form, setForm] = useState<RouteFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // View modal state
  const [viewRoute, setViewRoute] = useState<Route | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      const resp = await api.get<Branch[]>(
        "/api/branches/?skip=0&limit=200&status=active&sort_by=name&sort_order=asc"
      );
      setBranches(resp.data);
    } catch {
      // branches dropdown will be empty
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    setTableLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(pageSize),
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (branchFilter) params.set("branch_filter", branchFilter);
      if (statusFilter) params.set("status", statusFilter);

      const filterKeys = ["branch_filter", "status"];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<Route[]>(`/api/routes/?${params}`),
        api.get<number>(`/api/routes/count?${countParams}`),
      ]);
      setRoutes(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load routes.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, branchFilter, statusFilter]);

  useEffect(() => {
    fetchRoutes();
    fetchBranches();
  }, [fetchRoutes, fetchBranches]);

  const openCreateModal = () => {
    setEditingRoute(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (route: Route) => {
    setEditingRoute(route);
    setForm({
      branch_id_one: String(route.branch_id_one),
      branch_id_two: String(route.branch_id_two),
      is_active: route.is_active ?? true,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRoute(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const b1 = parseInt(form.branch_id_one);
    const b2 = parseInt(form.branch_id_two);
    if (!b1 || !b2) {
      setFormError("Please select both branches.");
      return;
    }
    if (b1 === b2) {
      setFormError("A route must connect two different branches.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingRoute) {
        const update: RouteUpdate = {};
        if (b1 !== editingRoute.branch_id_one) update.branch_id_one = b1;
        if (b2 !== editingRoute.branch_id_two) update.branch_id_two = b2;
        if (form.is_active !== (editingRoute.is_active ?? true))
          update.is_active = form.is_active;
        await api.patch(`/api/routes/${editingRoute.id}`, update);
      } else {
        const create: RouteCreate = { branch_id_one: b1, branch_id_two: b2 };
        await api.post("/api/routes/", create);
      }
      closeModal();
      await fetchRoutes();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Operation failed. Please try again.";
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

  const columns: Column<Route>[] = [
    {
      key: "id",
      label: "ID",
      sortable: true,
      render: (r) => <span className="text-muted-foreground">{r.id}</span>,
    },
    {
      key: "branch_id_one",
      label: "Branch One",
      sortable: true,
      render: (r) => (
        <span className="font-medium">
          {r.branch_one_name ?? r.branch_id_one}
        </span>
      ),
    },
    {
      key: "branch_id_two",
      label: "Branch Two",
      sortable: true,
      render: (r) => (
        <span className="font-medium">
          {r.branch_two_name ?? r.branch_id_two}
        </span>
      ),
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      render: (r) => (
        <Badge variant={r.is_active ? "default" : "destructive"}>
          {r.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setViewRoute(r)}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(r)}>
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
          <h1 className="text-2xl font-bold">Route Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage ferry routes between branches
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" /> Add Route
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
            <div>
              <Label className="mb-1.5 block">Branch</Label>
              <Select
                value={branchFilter || "all"}
                onValueChange={(v) => {
                  setBranchFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
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
            {(branchFilter || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBranchFilter("");
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
        data={routes}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No routes found. Click "Add Route" to create one.'
      />

      {/* View Modal */}
      <Dialog
        open={!!viewRoute}
        onOpenChange={(open) => !open && setViewRoute(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Route Details</DialogTitle>
          </DialogHeader>
          {viewRoute && (
            <div className="space-y-3">
              {(
                [
                  ["ID", viewRoute.id],
                  [
                    "Branch One",
                    viewRoute.branch_one_name ?? viewRoute.branch_id_one,
                  ],
                  [
                    "Branch Two",
                    viewRoute.branch_two_name ?? viewRoute.branch_id_two,
                  ],
                  [
                    "Status",
                    <Badge
                      key="status"
                      variant={viewRoute.is_active ? "default" : "destructive"}
                    >
                      {viewRoute.is_active ? "Active" : "Inactive"}
                    </Badge>,
                  ],
                ] as [string, React.ReactNode][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between items-center"
                >
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewRoute(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRoute ? "Edit Route" : "Add New Route"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Branch One *</Label>
              <Select
                value={form.branch_id_one || "placeholder"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    branch_id_one: v === "placeholder" ? "" : v,
                  })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>
                    Select a branch
                  </SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Branch Two *</Label>
              <Select
                value={form.branch_id_two || "placeholder"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    branch_id_two: v === "placeholder" ? "" : v,
                  })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>
                    Select a branch
                  </SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingRoute && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive routes are soft-deleted and hidden from normal
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
                  : editingRoute
                    ? "Update Route"
                    : "Create Route"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
