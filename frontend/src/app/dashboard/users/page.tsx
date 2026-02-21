"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { User, UserCreate, UserUpdate, UserRole, Route } from "@/types";
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

interface UserFormData {
  email: string;
  username: string;
  full_name: string;
  password: string;
  role: string;
  route_id: string;
  is_active: boolean;
}

const emptyForm: UserFormData = {
  email: "",
  username: "",
  full_name: "",
  password: "",
  role: "TICKET_CHECKER",
  route_id: "",
  is_active: true,
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "BILLING_OPERATOR", label: "Billing Operator" },
  { value: "TICKET_CHECKER", label: "Ticket Checker" },
];

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleString();
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [viewUser, setViewUser] = useState<User | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);

  const fetchRoutes = useCallback(async () => {
    try {
      const resp = await api.get<Route[]>("/api/routes/?limit=200&status=active");
      setRoutes(resp.data);
    } catch {
      // non-critical
    }
  }, []);

  const fetchUsers = useCallback(async () => {
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
      if (roleFilter) params.set("role_filter", roleFilter);
      if (statusFilter) params.set("status", statusFilter);

      const filterKeys = ["search", "search_column", "match_type", "role_filter", "status"];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<User[]>(`/api/users/?${params}`),
        api.get<number>(`/api/users/count?${countParams}`),
      ]);
      setUsers(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load users.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
    fetchRoutes();
  }, [fetchUsers, fetchRoutes]);

  const openCreateModal = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setForm({
      email: u.email,
      username: u.username,
      full_name: u.full_name,
      password: "",
      role: u.role,
      route_id: u.route_id != null ? String(u.route_id) : "",
      is_active: u.is_active,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      if (editingUser) {
        const update: UserUpdate = {};
        if (form.full_name !== editingUser.full_name) update.full_name = form.full_name;
        if (form.email !== editingUser.email) update.email = form.email;
        const formRole = form.role as UserRole;
        if (formRole !== editingUser.role) update.role = formRole;
        const formRouteId = form.route_id ? Number(form.route_id) : null;
        if (formRouteId !== editingUser.route_id) update.route_id = formRouteId;
        if (form.is_active !== editingUser.is_active) update.is_active = form.is_active;
        await api.patch(`/api/users/${editingUser.id}`, update);
      } else {
        const create: UserCreate = {
          email: form.email,
          username: form.username,
          full_name: form.full_name,
          password: form.password,
          role: form.role as UserRole,
          route_id: form.route_id ? Number(form.route_id) : null,
        };
        await api.post("/api/users/", create);
      }
      closeModal();
      await fetchUsers();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      let msg: string;
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((e: { msg?: string }) => e.msg || "Validation error").join("; ");
      } else {
        msg = "Operation failed. Please try again.";
      }
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

  const columns: Column<User>[] = [
    {
      key: "username",
      label: "Username",
      sortable: true,
      render: (u) => <span className="font-medium">{u.username}</span>,
    },
    {
      key: "full_name",
      label: "Full Name",
      sortable: true,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
    },
    {
      key: "role",
      label: "Role",
      sortable: true,
      render: (u) => (
        <Badge variant="secondary">{formatRole(u.role)}</Badge>
      ),
    },
    {
      key: "route_name",
      label: "Route",
      render: (u) => <span>{u.route_name || "\u2014"}</span>,
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      render: (u) => (
        <Badge variant={u.is_active ? "default" : "destructive"}>
          {u.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (u) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setViewUser(u)}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(u)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage user accounts, roles, and access permissions
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" /> Add User
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
            <div className="relative flex-1 min-w-[200px]">
              <Label className="mb-1.5 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by username, email, or name..."
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
              <Label className="mb-1.5 block">Role</Label>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(searchInput || statusFilter || roleFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setRoleFilter("");
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
        data={users}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No users found. Click "Add User" to create one.'
      />

      {/* View Modal */}
      <Dialog open={!!viewUser} onOpenChange={(open) => !open && setViewUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-3">
              {[
                ["ID", <span key="id" className="font-mono text-xs">{viewUser.id}</span>],
                ["Username", viewUser.username],
                ["Full Name", viewUser.full_name],
                ["Email", viewUser.email],
                ["Role", <Badge key="role" variant="secondary">{formatRole(viewUser.role)}</Badge>],
                ["Route", viewUser.route_name || "\u2014"],
                ["Status", <Badge key="status" variant={viewUser.is_active ? "default" : "destructive"}>{viewUser.is_active ? "Active" : "Inactive"}</Badge>],
                ["Verified", <Badge key="verified" variant={viewUser.is_verified ? "default" : "outline"}>{viewUser.is_verified ? "Verified" : "Unverified"}</Badge>],
                ["Last Login", formatDate(viewUser.last_login)],
                ["Created At", formatDate(viewUser.created_at)],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewUser(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add New User"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingUser && (
              <div>
                <Label>Username *</Label>
                <Input
                  required
                  maxLength={100}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. johndoe"
                  className="mt-1.5"
                />
              </div>
            )}
            <div>
              <Label>Full Name *</Label>
              <Input
                required
                maxLength={255}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="e.g. John Doe"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                required
                maxLength={255}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. john@ssmspl.com"
                className="mt-1.5"
              />
            </div>
            {!editingUser && (
              <div>
                <Label>Password *</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="mt-1.5"
                />
              </div>
            )}
            <div>
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Route</Label>
              <Select value={form.route_id || "none"} onValueChange={(v) => setForm({ ...form, route_id: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="No Route" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No Route —</SelectItem>
                  {routes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.branch_one_name} - {r.branch_two_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingUser && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive users cannot log in
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
                {submitting ? "Saving..." : editingUser ? "Update User" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
