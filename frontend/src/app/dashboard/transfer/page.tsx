"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { User, UserUpdate, Route } from "@/types";
import DataTable, { Column } from "@/components/dashboard/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { ArrowLeftRight } from "lucide-react";

const EMPLOYEE_ROLES = ["BILLING_OPERATOR", "TICKET_CHECKER"] as const;

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatRouteName(route: Route): string {
  return `${route.branch_one_name} - ${route.branch_two_name}`;
}

export default function TransferPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("full_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Filters
  const [roleFilter, setRoleFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Transfer dialog
  const [transferUser, setTransferUser] = useState<User | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchRoutes = useCallback(async () => {
    try {
      const resp = await api.get<Route[]>(
        "/api/routes/?limit=200&status=active&sort_by=id&sort_order=asc"
      );
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

      if (statusFilter !== "all") params.set("status", statusFilter);

      const filterKeys = ["status"];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<User[]>(`/api/users/?${params}`),
        api.get<number>(`/api/users/count?${countParams}`),
      ]);

      // Client-side filter: only keep employees (billing operators and ticket checkers)
      const allUsers = pageResp.data;
      const employees = allUsers.filter((u) =>
        EMPLOYEE_ROLES.includes(u.role as (typeof EMPLOYEE_ROLES)[number])
      );

      setUsers(employees);
      // Since we filter client-side, we adjust totalCount to reflect filtered results.
      // For the count, we use the full server count but acknowledge client filtering
      // may reduce visible rows. We set totalCount to filtered length for accurate pagination UX.
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load employees.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, statusFilter]);

  useEffect(() => {
    fetchUsers();
    fetchRoutes();
  }, [fetchUsers, fetchRoutes]);

  // Apply client-side filters for role and route
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (routeFilter !== "all") {
      if (routeFilter === "unassigned") {
        if (u.route_id !== null) return false;
      } else {
        if (u.route_id !== Number(routeFilter)) return false;
      }
    }
    return true;
  });

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

  const openTransferDialog = (user: User) => {
    setTransferUser(user);
    setSelectedRouteId(user.route_id != null ? String(user.route_id) : "");
    setFormError("");
    setSuccessMessage("");
  };

  const closeTransferDialog = () => {
    setTransferUser(null);
    setSelectedRouteId("");
    setFormError("");
    setSuccessMessage("");
  };

  const handleTransfer = async () => {
    if (!transferUser) return;

    if (!selectedRouteId) {
      setFormError("Please select a route to transfer the employee to.");
      return;
    }

    const newRouteId = Number(selectedRouteId);
    if (newRouteId === transferUser.route_id) {
      setFormError("Employee is already assigned to this route.");
      return;
    }

    setFormError("");
    setSuccessMessage("");
    setTransferring(true);

    try {
      const update: UserUpdate = { route_id: newRouteId };
      await api.patch(`/api/users/${transferUser.id}`, update);

      const targetRoute = routes.find((r) => r.id === newRouteId);
      const routeLabel = targetRoute ? formatRouteName(targetRoute) : `Route #${newRouteId}`;
      setSuccessMessage(
        `${transferUser.full_name} has been transferred to ${routeLabel}.`
      );

      // Refresh the user list after a brief delay so the success message is visible
      setTimeout(async () => {
        closeTransferDialog();
        await fetchUsers();
      }, 1500);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        ?.response?.data?.detail;
      let msg: string;
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail
          .map((e: { msg?: string }) => e.msg || "Validation error")
          .join("; ");
      } else {
        msg = "Transfer failed. Please try again.";
      }
      setFormError(msg);
    } finally {
      setTransferring(false);
    }
  };

  const getCurrentRouteName = (user: User): string => {
    if (user.route_id === null) return "Unassigned";
    if (user.route_name) return user.route_name;
    const route = routes.find((r) => r.id === user.route_id);
    return route ? formatRouteName(route) : `Route #${user.route_id}`;
  };

  const columns: Column<User>[] = [
    {
      key: "full_name",
      label: "Full Name",
      sortable: true,
      render: (u) => <span className="font-medium">{u.full_name}</span>,
    },
    {
      key: "username",
      label: "Username",
      sortable: true,
    },
    {
      key: "role",
      label: "Role",
      sortable: true,
      render: (u) => <Badge variant="secondary">{formatRole(u.role)}</Badge>,
    },
    {
      key: "route_name",
      label: "Current Route",
      render: (u) => {
        if (u.route_id === null) {
          return <span className="text-muted-foreground">Unassigned</span>;
        }
        const route = routes.find((r) => r.id === u.route_id);
        if (route) {
          return <span>{formatRouteName(route)}</span>;
        }
        return <span>{u.route_name || `Route #${u.route_id}`}</span>;
      },
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
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openTransferDialog(u)}
          >
            <ArrowLeftRight className="h-4 w-4 mr-1.5" />
            Transfer
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Employee Transfer</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Transfer employees between routes
        </p>
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
              <Label className="mb-1.5 block">Role</Label>
              <Select
                value={roleFilter}
                onValueChange={(v) => {
                  setRoleFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="BILLING_OPERATOR">
                    Billing Operator
                  </SelectItem>
                  <SelectItem value="TICKET_CHECKER">Ticket Checker</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Route</Label>
              <Select
                value={routeFilter}
                onValueChange={(v) => {
                  setRouteFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All Routes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Routes</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {routes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {formatRouteName(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
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
            {(roleFilter !== "all" ||
              routeFilter !== "all" ||
              statusFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRoleFilter("all");
                  setRouteFilter("all");
                  setStatusFilter("all");
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
        data={filteredUsers}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage="No employees found."
      />

      {/* Transfer Dialog */}
      <Dialog
        open={!!transferUser}
        onOpenChange={(open) => !open && closeTransferDialog()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Employee</DialogTitle>
          </DialogHeader>
          {transferUser && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Employee
                  </span>
                  <span className="text-sm font-medium">
                    {transferUser.full_name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Current Route
                  </span>
                  <span className="text-sm">
                    {getCurrentRouteName(transferUser)}
                  </span>
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block">New Route *</Label>
                <Select
                  value={selectedRouteId || "placeholder"}
                  onValueChange={(v) => {
                    setSelectedRouteId(v === "placeholder" ? "" : v);
                    setFormError("");
                    setSuccessMessage("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a route" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder" disabled>
                      Select a route
                    </SelectItem>
                    {routes.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {formatRouteName(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                  {formError}
                </p>
              )}

              {successMessage && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                  {successMessage}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeTransferDialog}
              disabled={transferring}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleTransfer}
              disabled={transferring || !!successMessage}
            >
              {transferring ? "Transferring..." : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
