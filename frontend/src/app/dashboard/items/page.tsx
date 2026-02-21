"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Item, ItemCreate, ItemUpdate } from "@/types";

interface ItemFormData {
  name: string;
  short_name: string;
  online_visibility: boolean;
  is_vehicle: boolean;
  is_active: boolean;
}

const emptyForm: ItemFormData = { name: "", short_name: "", online_visibility: false, is_vehicle: false, is_active: true };
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  // Pagination, sorting & filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchColumn, setSearchColumn] = useState("all");
  const [matchType, setMatchType] = useState("contains");
  const [idInput, setIdInput] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [idEndInput, setIdEndInput] = useState("");
  const [idFilterEnd, setIdFilterEnd] = useState("");
  const [idOp, setIdOp] = useState("eq");
  const [statusFilter, setStatusFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idEndDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form, setForm] = useState<ItemFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // View modal state
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
        params.set("search_column", searchColumn);
        params.set("match_type", matchType);
      }
      if (idFilter) {
        params.set("id_filter", idFilter);
        params.set("id_op", idOp);
        if (idOp === "between" && idFilterEnd) params.set("id_filter_end", idFilterEnd);
      }
      if (statusFilter) params.set("status", statusFilter);
      if (visibilityFilter) params.set("online_visibility", visibilityFilter);
      if (vehicleFilter) params.set("is_vehicle", vehicleFilter);

      const filterKeys = ["search", "search_column", "match_type", "id_filter", "id_op", "id_filter_end", "status", "online_visibility", "is_vehicle"];
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
  }, [page, pageSize, sortBy, sortOrder, search, searchColumn, matchType, idFilter, idOp, idFilterEnd, statusFilter, visibilityFilter, vehicleFilter]);

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
          <h2 className="text-2xl font-bold text-gray-800">Item Management</h2>
          <p className="text-gray-500 text-sm mt-1">
            Manage ticket item types in the system
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg transition"
        >
          + Add Item
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

        {/* Search column */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Search in</label>
          <select
            value={searchColumn}
            onChange={(e) => { setSearchColumn(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Fields</option>
            <option value="name">Name</option>
            <option value="short_name">Short Name</option>
          </select>
        </div>

        {/* Match type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Match</label>
          <select
            value={matchType}
            onChange={(e) => { setMatchType(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="contains">Contains</option>
            <option value="starts_with">Starts with</option>
            <option value="ends_with">Ends with</option>
          </select>
        </div>

        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder={
                searchColumn === "name" ? "Search by name..." :
                searchColumn === "short_name" ? "Search by short name..." :
                "Search by name or short name..."
              }
              value={searchInput}
              onChange={(e) => {
                const val = e.target.value;
                setSearchInput(val);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => { setSearch(val); setPage(1); }, 400);
              }}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Online visibility filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Visibility</label>
          <select
            value={visibilityFilter}
            onChange={(e) => { setVisibilityFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>

        {/* Vehicle filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle</label>
          <select
            value={vehicleFilter}
            onChange={(e) => { setVehicleFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
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
        {(searchInput || statusFilter || visibilityFilter || vehicleFilter || searchColumn !== "all" || matchType !== "contains" || idInput || idEndInput || idOp !== "eq") && (
          <button
            onClick={() => {
              setSearchInput(""); setSearch(""); setSearchColumn("all");
              setMatchType("contains"); setIdInput(""); setIdFilter("");
              setIdEndInput(""); setIdFilterEnd(""); setIdOp("eq");
              setStatusFilter(""); setVisibilityFilter(""); setVehicleFilter(""); setPage(1);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th onClick={() => handleSort("id")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">ID{sortIndicator("id")}</th>
              <th onClick={() => handleSort("name")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Name{sortIndicator("name")}</th>
              <th onClick={() => handleSort("short_name")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Short Name{sortIndicator("short_name")}</th>
              <th onClick={() => handleSort("online_visibility")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Online{sortIndicator("online_visibility")}</th>
              <th onClick={() => handleSort("is_vehicle")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Vehicle{sortIndicator("is_vehicle")}</th>
              <th onClick={() => handleSort("is_active")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Status{sortIndicator("is_active")}</th>
              <th className="text-right px-6 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  Loading items...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No items found. Click &quot;+ Add Item&quot; to create one.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4 text-gray-500">{item.id}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">{item.name}</td>
                  <td className="px-6 py-4 text-gray-600">{item.short_name}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                        item.online_visibility
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {item.online_visibility ? "Visible" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                        item.is_vehicle
                          ? "bg-orange-50 text-orange-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {item.is_vehicle ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                        item.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => setViewItem(item)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEditModal(item)}
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

      {/* View Modal (read-only popup) */}
      {viewItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Item Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">ID</span>
                <span className="text-sm text-gray-800">{viewItem.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Name</span>
                <span className="text-sm text-gray-800">{viewItem.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Short Name</span>
                <span className="text-sm text-gray-800">{viewItem.short_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Online Visibility</span>
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                    viewItem.online_visibility
                      ? "bg-blue-50 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {viewItem.online_visibility ? "Visible" : "Hidden"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Vehicle</span>
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                    viewItem.is_vehicle
                      ? "bg-orange-50 text-orange-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {viewItem.is_vehicle ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Status</span>
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                    viewItem.is_active
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {viewItem.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setViewItem(null)}
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
              {editingItem ? "Edit Item" : "Add New Item"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Adult Passenger"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Short Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={30}
                  value={form.short_name}
                  onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Adult"
                />
              </div>

              {/* Online visibility toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Online Visibility
                  </label>
                  <p className="text-xs text-gray-400">
                    Whether this item is visible for online booking
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, online_visibility: !form.online_visibility })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    form.online_visibility ? "bg-blue-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      form.online_visibility ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Vehicle toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Vehicle
                  </label>
                  <p className="text-xs text-gray-400">
                    Whether this item is a vehicle type
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_vehicle: !form.is_vehicle })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    form.is_vehicle ? "bg-orange-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      form.is_vehicle ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Status toggle - only shown when editing */}
              {editingItem && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <p className="text-xs text-gray-400">
                      Inactive items are soft-deleted and hidden from normal operations
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
                    : editingItem
                      ? "Update Item"
                      : "Create Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
