"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Branch, Route, RouteCreate, RouteUpdate } from "@/types";

interface RouteFormData {
  branch_id_one: string;
  branch_id_two: string;
  is_active: boolean;
}

const emptyForm: RouteFormData = { branch_id_one: "", branch_id_two: "", is_active: true };
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

export default function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  // Pagination, sorting & filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [branchFilter, setBranchFilter] = useState("");
  const [idInput, setIdInput] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [idEndInput, setIdEndInput] = useState("");
  const [idFilterEnd, setIdFilterEnd] = useState("");
  const [idOp, setIdOp] = useState("eq");
  const [statusFilter, setStatusFilter] = useState("");
  const idDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idEndDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [form, setForm] = useState<RouteFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // View modal state
  const [viewRoute, setViewRoute] = useState<Route | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      const resp = await api.get<Branch[]>("/api/branches/?skip=0&limit=200&status=active&sort_by=name&sort_order=asc");
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
      if (idFilter) {
        params.set("id_filter", idFilter);
        params.set("id_op", idOp);
        if (idOp === "between" && idFilterEnd) params.set("id_filter_end", idFilterEnd);
      }
      if (statusFilter) params.set("status", statusFilter);

      const filterKeys = ["branch_filter", "id_filter", "id_op", "id_filter_end", "status"];
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
  }, [page, pageSize, sortBy, sortOrder, branchFilter, idFilter, idOp, idFilterEnd, statusFilter]);

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
        if (form.is_active !== (editingRoute.is_active ?? true)) update.is_active = form.is_active;
        await api.patch(`/api/routes/${editingRoute.id}`, update);
      } else {
        const create: RouteCreate = { branch_id_one: b1, branch_id_two: b2 };
        await api.post("/api/routes/", create);
      }
      closeModal();
      await fetchRoutes();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Operation failed. Please try again.";
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
          <h2 className="text-2xl font-bold text-gray-800">Route Management</h2>
          <p className="text-gray-500 text-sm mt-1">
            Manage ferry routes between branches
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg transition"
        >
          + Add Route
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* ID filter operator */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">ID</label>
          <div className="flex">
            <select
              value={idOp}
              onChange={(e) => {
                const op = e.target.value;
                setIdOp(op);
                if (op !== "between") { setIdEndInput(""); setIdFilterEnd(""); }
                setPage(1);
              }}
              className="border border-gray-300 rounded-l-lg px-2 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            >
              <option value="eq">=</option>
              <option value="lt">&lt;</option>
              <option value="gt">&gt;</option>
              <option value="between">Between</option>
            </select>
            <input
              type="number"
              min="1"
              placeholder={idOp === "between" ? "From" : "ID"}
              value={idInput}
              onChange={(e) => {
                const val = e.target.value;
                setIdInput(val);
                if (idDebounceRef.current) clearTimeout(idDebounceRef.current);
                idDebounceRef.current = setTimeout(() => { setIdFilter(val); setPage(1); }, 400);
              }}
              className={`w-20 border border-l-0 border-gray-300 px-2 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${idOp !== "between" ? "rounded-r-lg" : ""}`}
            />
            {idOp === "between" && (
              <>
                <span className="flex items-center px-1.5 border-y border-gray-300 bg-gray-50 text-gray-400 text-xs">&ndash;</span>
                <input
                  type="number"
                  min="1"
                  placeholder="To"
                  value={idEndInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIdEndInput(val);
                    if (idEndDebounceRef.current) clearTimeout(idEndDebounceRef.current);
                    idEndDebounceRef.current = setTimeout(() => { setIdFilterEnd(val); setPage(1); }, 400);
                  }}
                  className="w-20 border border-l-0 border-gray-300 rounded-r-lg px-2 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </>
            )}
          </div>
        </div>

        {/* Branch filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Clear filters */}
        {(branchFilter || statusFilter || idInput || idEndInput || idOp !== "eq") && (
          <button
            onClick={() => {
              setBranchFilter(""); setIdInput(""); setIdFilter("");
              setIdEndInput(""); setIdFilterEnd(""); setIdOp("eq");
              setStatusFilter(""); setPage(1);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Routes Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th onClick={() => handleSort("id")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">ID{sortIndicator("id")}</th>
              <th onClick={() => handleSort("branch_id_one")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Branch One{sortIndicator("branch_id_one")}</th>
              <th onClick={() => handleSort("branch_id_two")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Branch Two{sortIndicator("branch_id_two")}</th>
              <th onClick={() => handleSort("is_active")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Status{sortIndicator("is_active")}</th>
              <th className="text-right px-6 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  Loading routes...
                </td>
              </tr>
            ) : routes.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  No routes found. Click &quot;+ Add Route&quot; to create one.
                </td>
              </tr>
            ) : (
              routes.map((route) => (
                <tr
                  key={route.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4 text-gray-500">{route.id}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">{route.branch_one_name ?? route.branch_id_one}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">{route.branch_two_name ?? route.branch_id_two}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                        route.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {route.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => setViewRoute(route)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEditModal(route)}
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
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L11.832 10l3.938 3.71a.75.75 0 01.02 1.06zm-6 0a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L5.832 10l3.938 3.71a.75.75 0 01.02 1.06z" clipRule="evenodd" /></svg>
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M12.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L8.832 10l3.938 3.71a.75.75 0 01.02 1.06z" clipRule="evenodd" /></svg>
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Last page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.21 14.77a.75.75 0 01.02-1.06L8.168 10 4.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02zm6 0a.75.75 0 01.02-1.06L14.168 10 10.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      {/* View Modal */}
      {viewRoute && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Route Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">ID</span>
                <span className="text-sm text-gray-800">{viewRoute.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Branch One</span>
                <span className="text-sm text-gray-800">{viewRoute.branch_one_name ?? viewRoute.branch_id_one}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Branch Two</span>
                <span className="text-sm text-gray-800">{viewRoute.branch_two_name ?? viewRoute.branch_id_two}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Status</span>
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                    viewRoute.is_active
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {viewRoute.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setViewRoute(null)}
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
              {editingRoute ? "Edit Route" : "Add New Route"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch One *
                </label>
                <select
                  required
                  value={form.branch_id_one}
                  onChange={(e) => setForm({ ...form, branch_id_one: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch Two *
                </label>
                <select
                  required
                  value={form.branch_id_two}
                  onChange={(e) => setForm({ ...form, branch_id_two: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Status toggle - only shown when editing */}
              {editingRoute && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <p className="text-xs text-gray-400">
                      Inactive routes are soft-deleted and hidden from normal operations
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      form.is_active ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        form.is_active ? "translate-x-6" : "translate-x-1"
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
                    : editingRoute
                      ? "Update Route"
                      : "Create Route"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
