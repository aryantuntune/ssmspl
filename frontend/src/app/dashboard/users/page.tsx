"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { User, UserCreate, UserUpdate, UserRole, Route } from "@/types";

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

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

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

  // Pagination, sorting & filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchColumn, setSearchColumn] = useState("all");
  const [matchType, setMatchType] = useState("contains");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // View modal state
  const [viewUser, setViewUser] = useState<User | null>(null);

  // Routes for dropdown
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
        params.set("search_column", searchColumn);
        params.set("match_type", matchType);
      }
      if (roleFilter) params.set("role_filter", roleFilter);
      if (statusFilter) params.set("status", statusFilter);

      const filterKeys = [
        "search",
        "search_column",
        "match_type",
        "role_filter",
        "status",
      ];
      const countParams = new URLSearchParams(
        Object.fromEntries(
          [...params].filter(([k]) => filterKeys.includes(k))
        )
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
  }, [
    page,
    pageSize,
    sortBy,
    sortOrder,
    search,
    searchColumn,
    matchType,
    roleFilter,
    statusFilter,
  ]);

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
        if (form.full_name !== editingUser.full_name)
          update.full_name = form.full_name;
        if (form.email !== editingUser.email) update.email = form.email;
        const formRole = form.role as UserRole;
        if (formRole !== editingUser.role) update.role = formRole;
        const formRouteId = form.route_id ? Number(form.route_id) : null;
        if (formRouteId !== editingUser.route_id)
          update.route_id = formRouteId;
        if (form.is_active !== editingUser.is_active)
          update.is_active = form.is_active;
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
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail;
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

  // Pagination computed values
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const sortIndicator = (column: string) => {
    if (sortBy !== column) return "";
    return sortOrder === "asc" ? " \u25B2" : " \u25BC";
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            User Management
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Manage user accounts, roles, and access permissions
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg transition"
        >
          + Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* Search column */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Search in
          </label>
          <select
            value={searchColumn}
            onChange={(e) => {
              setSearchColumn(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Fields</option>
            <option value="username">Username</option>
            <option value="email">Email</option>
            <option value="full_name">Full Name</option>
          </select>
        </div>

        {/* Match type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Match
          </label>
          <select
            value={matchType}
            onChange={(e) => {
              setMatchType(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="contains">Contains</option>
            <option value="starts_with">Starts with</option>
            <option value="ends_with">Ends with</option>
          </select>
        </div>

        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Search
          </label>
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              placeholder={
                searchColumn === "username"
                  ? "Search by username..."
                  : searchColumn === "email"
                    ? "Search by email..."
                    : searchColumn === "full_name"
                      ? "Search by full name..."
                      : "Search by username, email, or name..."
              }
              value={searchInput}
              onChange={(e) => {
                const val = e.target.value;
                setSearchInput(val);
                if (debounceRef.current)
                  clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => {
                  setSearch(val);
                  setPage(1);
                }, 400);
              }}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Role filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Role
          </label>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Clear filters */}
        {(searchInput ||
          statusFilter ||
          roleFilter ||
          searchColumn !== "all" ||
          matchType !== "contains") && (
          <button
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setSearchColumn("all");
              setMatchType("contains");
              setRoleFilter("");
              setStatusFilter("");
              setPage(1);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th
                onClick={() => handleSort("username")}
                className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
              >
                Username{sortIndicator("username")}
              </th>
              <th
                onClick={() => handleSort("full_name")}
                className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
              >
                Full Name{sortIndicator("full_name")}
              </th>
              <th
                onClick={() => handleSort("email")}
                className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
              >
                Email{sortIndicator("email")}
              </th>
              <th
                onClick={() => handleSort("role")}
                className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
              >
                Role{sortIndicator("role")}
              </th>
              <th className="text-left px-6 py-3 font-semibold text-gray-600">
                Route
              </th>
              <th
                onClick={() => handleSort("is_active")}
                className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
              >
                Status{sortIndicator("is_active")}
              </th>
              <th className="text-right px-6 py-3 font-semibold text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {tableLoading ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-8 text-gray-400"
                >
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-8 text-gray-400"
                >
                  No users found. Click &quot;+ Add User&quot; to create
                  one.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4 font-medium text-gray-800">
                    {u.username}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {u.full_name}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                      {formatRole(u.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {u.route_name || "\u2014"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                        u.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => setViewUser(u)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEditModal(u)}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm transition"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) =>
              handlePageSizeChange(Number(e.target.value))
            }
            className="border border-gray-300 rounded-md px-2 py-1 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span>
            {totalCount === 0
              ? "No records"
              : `${(page - 1) * pageSize + 1}\u2013${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
          </span>
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="First page"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M15.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L11.832 10l3.938 3.71a.75.75 0 01.02 1.06zm-6 0a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L5.832 10l3.938 3.71a.75.75 0 01.02 1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M12.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L8.832 10l3.938 3.71a.75.75 0 01.02 1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={() =>
              setPage((p) => Math.min(totalPages, p + 1))
            }
            disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next page"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Last page"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M4.21 14.77a.75.75 0 01.02-1.06L8.168 10 4.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02zm6 0a.75.75 0 01.02-1.06L14.168 10 10.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* View Modal (read-only popup) */}
      {viewUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              User Details
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  ID
                </span>
                <span className="text-sm text-gray-800 font-mono">
                  {viewUser.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Username
                </span>
                <span className="text-sm text-gray-800">
                  {viewUser.username}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Full Name
                </span>
                <span className="text-sm text-gray-800">
                  {viewUser.full_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Email
                </span>
                <span className="text-sm text-gray-800">
                  {viewUser.email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Role
                </span>
                <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                  {formatRole(viewUser.role)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Route
                </span>
                <span className="text-sm text-gray-800">
                  {viewUser.route_name || "\u2014"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Status
                </span>
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                    viewUser.is_active
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {viewUser.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Verified
                </span>
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                    viewUser.is_verified
                      ? "bg-green-50 text-green-700"
                      : "bg-yellow-50 text-yellow-700"
                  }`}
                >
                  {viewUser.is_verified ? "Verified" : "Unverified"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Last Login
                </span>
                <span className="text-sm text-gray-800">
                  {formatDate(viewUser.last_login)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Created At
                </span>
                <span className="text-sm text-gray-800">
                  {formatDate(viewUser.created_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Updated At
                </span>
                <span className="text-sm text-gray-800">
                  {formatDate(viewUser.updated_at)}
                </span>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setViewUser(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {editingUser ? "Edit User" : "Add New User"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username - only for create */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={form.username}
                    onChange={(e) =>
                      setForm({ ...form, username: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. johndoe"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  maxLength={255}
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. john@ssmspl.com"
                />
              </div>

              {/* Password - only for create */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Min 8 characters"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  required
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Route
                </label>
                <select
                  value={form.route_id}
                  onChange={(e) =>
                    setForm({ ...form, route_id: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— No Route —</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.branch_one_name} - {r.branch_two_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status toggle - only shown when editing */}
              {editingUser && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <p className="text-xs text-gray-400">
                      Inactive users are soft-deleted and cannot log in
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, is_active: !form.is_active })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      form.is_active ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        form.is_active
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60"
                >
                  {submitting
                    ? "Saving..."
                    : editingUser
                      ? "Update User"
                      : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
