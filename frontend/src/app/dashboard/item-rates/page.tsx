"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { User, Item, Route, ItemRate, ItemRateCreate, ItemRateUpdate } from "@/types";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

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
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

export default function ItemRatesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [itemRates, setItemRates] = useState<ItemRate[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  // Pagination, sorting & filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [itemFilter, setItemFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [idInput, setIdInput] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [idEndInput, setIdEndInput] = useState("");
  const [idFilterEnd, setIdFilterEnd] = useState("");
  const [idOp, setIdOp] = useState("eq");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const idDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idEndDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (idFilter) {
        params.set("id_filter", idFilter);
        params.set("id_op", idOp);
        if (idOp === "between" && idFilterEnd) params.set("id_filter_end", idFilterEnd);
      }
      if (statusFilter) params.set("status", statusFilter);
      if (fromDate) params.set("from_date", fromDate);

      const filterKeys = ["item_filter", "route_filter", "id_filter", "id_op", "id_filter_end", "status", "from_date"];
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
  }, [page, pageSize, sortBy, sortOrder, itemFilter, routeFilter, idFilter, idOp, idFilterEnd, statusFilter, fromDate]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api
      .get<User>("/api/auth/me")
      .then(({ data }) => {
        setUser(data);
        return Promise.all([fetchItemRates(), fetchItems(), fetchRoutes()]);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router, fetchItemRates, fetchItems, fetchRoutes]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar user={user} />
      <div className="flex flex-1">
        <Sidebar menuItems={user.menu_items} />
        <main className="flex-1 p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Item Rate Management</h2>
              <p className="text-gray-500 text-sm mt-1">
                Manage rates and levies for items on specific routes
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={openCreateModal}
                className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg transition"
              >
                + Add Item Rate
              </button>
              <button
                onClick={() => { setUpcomingDate(""); setUpcomingError(""); setShowUpcomingModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-lg transition"
              >
                + Add Item Rates for Upcoming Date
              </button>
            </div>
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

            {/* Item filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Item</label>
              <select
                value={itemFilter}
                onChange={(e) => { setItemFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Items</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>

            {/* Route filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Route</label>
              <select
                value={routeFilter}
                onChange={(e) => { setRouteFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Routes</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.branch_one_name && r.branch_two_name
                      ? `${r.branch_one_name} - ${r.branch_two_name}`
                      : `Route ${r.id}`}
                  </option>
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

            {/* From Date filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Clear filters */}
            {(itemFilter || routeFilter || statusFilter || idInput || idEndInput || idOp !== "eq" || fromDate) && (
              <button
                onClick={() => {
                  setItemFilter(""); setRouteFilter("");
                  setIdInput(""); setIdFilter("");
                  setIdEndInput(""); setIdFilterEnd(""); setIdOp("eq");
                  setStatusFilter(""); setFromDate(""); setPage(1);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline pb-2"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Item Rates Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[calc(100vh-220px)]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th onClick={() => handleSort("id")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">ID{sortIndicator("id")}</th>
                  <th onClick={() => handleSort("item_id")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Item{sortIndicator("item_id")}</th>
                  <th onClick={() => handleSort("route_id")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Route{sortIndicator("route_id")}</th>
                  <th onClick={() => handleSort("rate")} className="text-right px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Rate{sortIndicator("rate")}</th>
                  <th onClick={() => handleSort("levy")} className="text-right px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Levy{sortIndicator("levy")}</th>
                  <th onClick={() => handleSort("applicable_from_date")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">From Date{sortIndicator("applicable_from_date")}</th>
                  <th onClick={() => handleSort("is_active")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Status{sortIndicator("is_active")}</th>
                  <th className="text-right px-6 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-400">
                      Loading item rates...
                    </td>
                  </tr>
                ) : itemRates.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-400">
                      No item rates found. Click &quot;+ Add Item Rate&quot; to create one.
                    </td>
                  </tr>
                ) : (
                  itemRates.map((ir) => (
                    <tr
                      key={ir.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4 text-gray-500">{ir.id}</td>
                      <td className="px-6 py-4 font-medium text-gray-800">{ir.item_name ?? ir.item_id}</td>
                      <td className="px-6 py-4 font-medium text-gray-800">{ir.route_name ?? ir.route_id}</td>
                      <td className="px-6 py-4 text-right text-gray-800">{ir.rate != null ? ir.rate.toFixed(2) : "-"}</td>
                      <td className="px-6 py-4 text-right text-gray-800">{ir.levy != null ? ir.levy.toFixed(2) : "-"}</td>
                      <td className="px-6 py-4 text-gray-800">{ir.applicable_from_date ?? "-"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                            ir.is_active
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {ir.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-3">
                        <button
                          onClick={() => setViewRate(ir)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition"
                        >
                          View
                        </button>
                        <button
                          onClick={() => openEditModal(ir)}
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
          {viewRate && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Item Rate Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">ID</span>
                    <span className="text-sm text-gray-800">{viewRate.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Item</span>
                    <span className="text-sm text-gray-800">{viewRate.item_name ?? viewRate.item_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Route</span>
                    <span className="text-sm text-gray-800">{viewRate.route_name ?? viewRate.route_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Rate</span>
                    <span className="text-sm text-gray-800">{viewRate.rate != null ? viewRate.rate.toFixed(2) : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Levy</span>
                    <span className="text-sm text-gray-800">{viewRate.levy != null ? viewRate.levy.toFixed(2) : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Applicable From</span>
                    <span className="text-sm text-gray-800">{viewRate.applicable_from_date ?? "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Status</span>
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                        viewRate.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {viewRate.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => setViewRate(null)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upcoming Date Modal */}
          {showUpcomingModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-2">Add Item Rates for Upcoming Date</h3>
                <p className="text-sm text-gray-500 mb-4">
                  All active item rates will be duplicated with the new applicable date.
                </p>
                <form
                  onSubmit={async (e) => {
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
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Applicable From Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={upcomingDate}
                      onChange={(e) => setUpcomingDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {upcomingError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      {upcomingError}
                    </p>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowUpcomingModal(false)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={upcomingSubmitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60"
                    >
                      {upcomingSubmitting ? "Creating..." : "Create Rates"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Create/Edit Modal */}
          {showModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {editingRate ? "Edit Item Rate" : "Add New Item Rate"}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Item *
                    </label>
                    <select
                      required
                      value={form.item_id}
                      onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select an item</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Route *
                    </label>
                    <select
                      required
                      value={form.route_id}
                      onChange={(e) => setForm({ ...form, route_id: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a route</option>
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.branch_one_name && r.branch_two_name
                            ? `${r.branch_one_name} - ${r.branch_two_name}`
                            : `Route ${r.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Rate
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={form.rate}
                        onChange={(e) => setForm({ ...form, rate: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Levy
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={form.levy}
                        onChange={(e) => setForm({ ...form, levy: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Applicable From Date
                    </label>
                    <input
                      type="date"
                      value={form.applicable_from_date}
                      onChange={(e) => setForm({ ...form, applicable_from_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Status toggle - only shown when editing */}
                  {editingRate && (
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Status
                        </label>
                        <p className="text-xs text-gray-400">
                          Inactive item rates are soft-deleted and hidden from normal operations
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
                        : editingRate
                          ? "Update Item Rate"
                          : "Create Item Rate"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
