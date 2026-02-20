"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { isAuthenticated, getSelectedBranchId, getSelectedBranchName } from "@/lib/auth";
import {
  User,
  Ticket,
  TicketCreate,
  TicketUpdate,
  TicketItemCreate,
  TicketItemUpdate,
  Branch,
  Route,
  Item,
  PaymentMode,
  RateLookupResponse,
  DepartureOption,
} from "@/types";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

interface FormItem {
  tempId: string;
  id: number | null;
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no: string;
  is_cancelled: boolean;
}

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

export default function TicketingPage() {
  const router = useRouter();

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Data
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Sorting
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filters
  const [branchFilter, setBranchFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ticketNoInput, setTicketNoInput] = useState("");
  const [ticketNoFilter, setTicketNoFilter] = useState("");
  const [idInput, setIdInput] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [idOp, setIdOp] = useState("eq");
  const [idEndInput, setIdEndInput] = useState("");
  const [idFilterEnd, setIdFilterEnd] = useState("");

  const ticketNoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idEndDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dropdown data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allRoutes, setAllRoutes] = useState<Route[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // View modal
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);

  // Master form fields
  const [formBranchId, setFormBranchId] = useState(0);
  const [formRouteId, setFormRouteId] = useState(0);
  const [formTicketDate, setFormTicketDate] = useState("");
  const [formDeparture, setFormDeparture] = useState("");
  const [formPaymentModeId, setFormPaymentModeId] = useState(0);
  const [formDiscount, setFormDiscount] = useState(0);

  // Detail items
  const [formItems, setFormItems] = useState<FormItem[]>([]);

  // Departure options
  const [departureOptions, setDepartureOptions] = useState<DepartureOption[]>([]);

  // Computed amounts
  const [formAmount, setFormAmount] = useState(0);
  const [formNetAmount, setFormNetAmount] = useState(0);

  // Filtered routes based on selected branch
  const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);

  // Amount recalculation
  useEffect(() => {
    const total = formItems
      .filter((fi) => !fi.is_cancelled)
      .reduce((sum, fi) => sum + fi.quantity * (fi.rate + fi.levy), 0);
    const amt = Math.round(total * 100) / 100;
    const disc = formDiscount || 0;
    const net = Math.round((amt - disc) * 100) / 100;
    setFormAmount(amt);
    setFormNetAmount(net);
  }, [formItems, formDiscount]);

  const fetchTickets = useCallback(async () => {
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
      if (routeFilter) params.set("route_filter", routeFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (statusFilter) params.set("status", statusFilter);
      if (ticketNoFilter) params.set("ticket_no_filter", ticketNoFilter);
      if (idFilter) {
        params.set("id_filter", idFilter);
        params.set("id_op", idOp);
        if (idOp === "between" && idFilterEnd) params.set("id_filter_end", idFilterEnd);
      }

      const filterKeys = [
        "branch_filter",
        "route_filter",
        "date_from",
        "date_to",
        "status",
        "ticket_no_filter",
        "id_filter",
        "id_op",
        "id_filter_end",
      ];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<Ticket[]>(`/api/tickets/?${params}`),
        api.get<number>(`/api/tickets/count?${countParams}`),
      ]);
      setTickets(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load tickets.");
    } finally {
      setTableLoading(false);
    }
  }, [
    page,
    pageSize,
    sortBy,
    sortOrder,
    branchFilter,
    routeFilter,
    dateFrom,
    dateTo,
    statusFilter,
    ticketNoFilter,
    idFilter,
    idOp,
    idFilterEnd,
  ]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api
      .get<User>("/api/auth/me")
      .then(async ({ data }) => {
        setUser(data);
        // Fetch dropdown data in parallel
        try {
          const [branchRes, routeRes, itemRes, pmRes] = await Promise.all([
            api.get<Branch[]>("/api/branches/?limit=200&status=active"),
            api.get<Route[]>("/api/routes/?limit=200&status=active"),
            api.get<Item[]>("/api/items/?limit=200&status=active"),
            api.get<PaymentMode[]>("/api/payment-modes/?limit=200&status=active"),
          ]);
          setBranches(branchRes.data);
          setAllRoutes(routeRes.data);
          setItems(itemRes.data);
          setPaymentModes(pmRes.data);
        } catch {
          /* dropdown load failure is non-fatal */
        }
        return fetchTickets();
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router, fetchTickets]);

  // Branch change handler for modal
  const handleBranchChange = async (branchId: number) => {
    setFormBranchId(branchId);
    setFormRouteId(0);
    setFormDeparture("");
    const filtered = allRoutes.filter(
      (r) => r.branch_id_one === branchId || r.branch_id_two === branchId
    );
    setFilteredRoutes(filtered);
    try {
      const res = await api.get<DepartureOption[]>(
        `/api/tickets/departure-options?branch_id=${branchId}`
      );
      setDepartureOptions(res.data);
    } catch {
      setDepartureOptions([]);
    }
  };

  // Item change handler for detail rows
  const handleItemChange = async (tempId: string, itemId: number) => {
    const updated = formItems.map((fi) =>
      fi.tempId === tempId ? { ...fi, item_id: itemId, rate: 0, levy: 0 } : fi
    );
    setFormItems(updated);
    if (formRouteId) {
      try {
        const res = await api.get<RateLookupResponse>(
          `/api/tickets/rate-lookup?item_id=${itemId}&route_id=${formRouteId}`
        );
        setFormItems((prev) =>
          prev.map((fi) =>
            fi.tempId === tempId
              ? { ...fi, rate: res.data.rate, levy: res.data.levy }
              : fi
          )
        );
      } catch {
        /* rate not found, keep 0 */
      }
    }
  };

  // Add item row
  const handleAddItem = () => {
    setFormItems((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        id: null,
        item_id: 0,
        rate: 0,
        levy: 0,
        quantity: 1,
        vehicle_no: "",
        is_cancelled: false,
      },
    ]);
  };

  // Cancel / remove item row
  const handleCancelItem = (tempId: string) => {
    if (editingTicket) {
      // In edit mode, mark as cancelled (keep visible but greyed out)
      const item = formItems.find((fi) => fi.tempId === tempId);
      if (item && item.id) {
        setFormItems((prev) =>
          prev.map((fi) =>
            fi.tempId === tempId ? { ...fi, is_cancelled: true } : fi
          )
        );
      } else {
        // New item in edit mode (no DB id) — just remove
        setFormItems((prev) => prev.filter((fi) => fi.tempId !== tempId));
      }
    } else {
      // In create mode, remove the row entirely
      setFormItems((prev) => prev.filter((fi) => fi.tempId !== tempId));
    }
  };

  // Restore cancelled item
  const handleRestoreItem = (tempId: string) => {
    setFormItems((prev) =>
      prev.map((fi) =>
        fi.tempId === tempId ? { ...fi, is_cancelled: false } : fi
      )
    );
  };

  // Open create modal
  const openCreateModal = async () => {
    setEditingTicket(null);
    setFormTicketDate(new Date().toISOString().split("T")[0]);
    setFormDeparture("");
    setFormPaymentModeId(0);
    setFormDiscount(0);
    setFormItems([]);
    setFormError("");

    // Auto-fill branch and route from user profile / login selection
    const selectedBranchId = getSelectedBranchId();
    if (user?.route_id && selectedBranchId) {
      setFormBranchId(selectedBranchId);
      setFormRouteId(user.route_id);
      setFilteredRoutes(allRoutes);
      // Fetch departure options for the selected branch
      try {
        const res = await api.get<DepartureOption[]>(
          `/api/tickets/departure-options?branch_id=${selectedBranchId}`
        );
        setDepartureOptions(res.data);
      } catch {
        setDepartureOptions([]);
      }
    } else {
      setFormBranchId(0);
      setFormRouteId(0);
      setFilteredRoutes([]);
      setDepartureOptions([]);
    }

    setShowModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setEditingTicket(null);
    setFormBranchId(0);
    setFormRouteId(0);
    setFormTicketDate("");
    setFormDeparture("");
    setFormPaymentModeId(0);
    setFormDiscount(0);
    setFormItems([]);
    setFilteredRoutes([]);
    setDepartureOptions([]);
    setFormError("");
  };

  // View ticket
  const handleView = async (ticket: Ticket) => {
    try {
      const res = await api.get<Ticket>(`/api/tickets/${ticket.id}`);
      setViewTicket(res.data);
    } catch {
      setError("Failed to load ticket details.");
    }
  };

  // Edit ticket
  const handleEdit = async (ticket: Ticket) => {
    try {
      const res = await api.get<Ticket>(`/api/tickets/${ticket.id}`);
      const t = res.data;
      setEditingTicket(t);
      setFormBranchId(t.branch_id);
      setFormRouteId(t.route_id);
      setFormTicketDate(t.ticket_date);
      setFormDeparture(t.departure || "");
      setFormPaymentModeId(t.payment_mode_id);
      setFormDiscount(t.discount || 0);
      const filtered = allRoutes.filter(
        (r) => r.branch_id_one === t.branch_id || r.branch_id_two === t.branch_id
      );
      setFilteredRoutes(filtered);
      try {
        const dr = await api.get<DepartureOption[]>(
          `/api/tickets/departure-options?branch_id=${t.branch_id}`
        );
        setDepartureOptions(dr.data);
      } catch {
        setDepartureOptions([]);
      }
      setFormItems(
        (t.items || []).map((ti) => ({
          tempId: crypto.randomUUID(),
          id: ti.id,
          item_id: ti.item_id,
          rate: ti.rate,
          levy: ti.levy,
          quantity: ti.quantity,
          vehicle_no: ti.vehicle_no || "",
          is_cancelled: ti.is_cancelled,
        }))
      );
      setFormError("");
      setShowModal(true);
    } catch {
      setError("Failed to load ticket for editing.");
    }
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const activeItems = formItems.filter((fi) => !fi.is_cancelled);
    if (activeItems.length === 0) {
      setFormError("At least one active item is required.");
      return;
    }
    if (!formBranchId || !formRouteId || !formPaymentModeId) {
      setFormError("Branch, Route, and Payment Mode are required.");
      return;
    }
    if (activeItems.some((fi) => !fi.item_id)) {
      setFormError("All items must have an item selected.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingTicket) {
        const update: TicketUpdate = {};
        if (formDeparture !== (editingTicket.departure || ""))
          update.departure = formDeparture || null;
        if (formRouteId !== editingTicket.route_id) update.route_id = formRouteId;
        if (formPaymentModeId !== editingTicket.payment_mode_id)
          update.payment_mode_id = formPaymentModeId;
        if ((formDiscount || 0) !== (editingTicket.discount || 0))
          update.discount = formDiscount || 0;
        update.amount = formAmount;
        update.net_amount = formNetAmount;
        update.items = formItems.map((fi): TicketItemUpdate => ({
          id: fi.id,
          item_id: fi.item_id,
          rate: fi.rate,
          levy: fi.levy,
          quantity: fi.quantity,
          vehicle_no: fi.vehicle_no || null,
          is_cancelled: fi.is_cancelled,
        }));
        await api.patch(`/api/tickets/${editingTicket.id}`, update);
      } else {
        const create: TicketCreate = {
          branch_id: formBranchId,
          ticket_date: formTicketDate,
          departure: formDeparture || null,
          route_id: formRouteId,
          payment_mode_id: formPaymentModeId,
          discount: formDiscount || 0,
          amount: formAmount,
          net_amount: formNetAmount,
          items: activeItems.map((fi): TicketItemCreate => ({
            item_id: fi.item_id,
            rate: fi.rate,
            levy: fi.levy,
            quantity: fi.quantity,
            vehicle_no: fi.vehicle_no || null,
          })),
        };
        await api.post("/api/tickets/", create);
      }
      closeModal();
      await fetchTickets();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Operation failed.";
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

  const clearFilters = () => {
    setBranchFilter("");
    setRouteFilter("");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("");
    setTicketNoInput("");
    setTicketNoFilter("");
    setIdInput("");
    setIdFilter("");
    setIdEndInput("");
    setIdFilterEnd("");
    setIdOp("eq");
    setPage(1);
  };

  const hasActiveFilters =
    branchFilter ||
    routeFilter ||
    dateFrom ||
    dateTo ||
    statusFilter ||
    ticketNoInput ||
    idInput ||
    idEndInput ||
    idOp !== "eq";

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
              <h2 className="text-2xl font-bold text-gray-800">Ticket Management</h2>
              <p className="text-gray-500 text-sm mt-1">
                Create and manage ferry tickets
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg transition"
            >
              + New Ticket
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
                    if (op !== "between") {
                      setIdEndInput("");
                      setIdFilterEnd("");
                    }
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
                    idDebounceRef.current = setTimeout(() => {
                      setIdFilter(val);
                      setPage(1);
                    }, 400);
                  }}
                  className={`w-20 border border-l-0 border-gray-300 px-2 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    idOp !== "between" ? "rounded-r-lg" : ""
                  }`}
                />
                {idOp === "between" && (
                  <>
                    <span className="flex items-center px-1.5 border-y border-gray-300 bg-gray-50 text-gray-400 text-xs">
                      &ndash;
                    </span>
                    <input
                      type="number"
                      min="1"
                      placeholder="To"
                      value={idEndInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setIdEndInput(val);
                        if (idEndDebounceRef.current) clearTimeout(idEndDebounceRef.current);
                        idEndDebounceRef.current = setTimeout(() => {
                          setIdFilterEnd(val);
                          setPage(1);
                        }, 400);
                      }}
                      className="w-20 border border-l-0 border-gray-300 rounded-r-lg px-2 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Ticket No filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Ticket No
              </label>
              <input
                type="number"
                min="1"
                placeholder="Ticket No"
                value={ticketNoInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setTicketNoInput(val);
                  if (ticketNoDebounceRef.current)
                    clearTimeout(ticketNoDebounceRef.current);
                  ticketNoDebounceRef.current = setTimeout(() => {
                    setTicketNoFilter(val);
                    setPage(1);
                  }, 400);
                }}
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Branch filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Branch
              </label>
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Route filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Route
              </label>
              <select
                value={routeFilter}
                onChange={(e) => {
                  setRouteFilter(e.target.value);
                  setPage(1);
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Routes</option>
                {allRoutes.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.branch_one_name} - {r.branch_two_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Date From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Date To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-gray-700 underline pb-2"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Tickets Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[calc(100vh-220px)]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th
                    onClick={() => handleSort("id")}
                    className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    ID{sortIndicator("id")}
                  </th>
                  <th
                    onClick={() => handleSort("ticket_no")}
                    className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Ticket No{sortIndicator("ticket_no")}
                  </th>
                  <th
                    onClick={() => handleSort("branch_id")}
                    className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Branch{sortIndicator("branch_id")}
                  </th>
                  <th
                    onClick={() => handleSort("route_id")}
                    className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Route{sortIndicator("route_id")}
                  </th>
                  <th
                    onClick={() => handleSort("ticket_date")}
                    className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Date{sortIndicator("ticket_date")}
                  </th>
                  <th
                    onClick={() => handleSort("departure")}
                    className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Departure{sortIndicator("departure")}
                  </th>
                  <th
                    onClick={() => handleSort("amount")}
                    className="text-right px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Amount{sortIndicator("amount")}
                  </th>
                  <th
                    onClick={() => handleSort("discount")}
                    className="text-right px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Discount{sortIndicator("discount")}
                  </th>
                  <th
                    onClick={() => handleSort("net_amount")}
                    className="text-right px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Net Amount{sortIndicator("net_amount")}
                  </th>
                  <th
                    onClick={() => handleSort("payment_mode_id")}
                    className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Payment Mode{sortIndicator("payment_mode_id")}
                  </th>
                  <th
                    onClick={() => handleSort("is_cancelled")}
                    className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700"
                  >
                    Status{sortIndicator("is_cancelled")}
                  </th>
                  <th className="text-right px-6 py-3 font-semibold text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={12} className="text-center py-8 text-gray-400">
                      Loading tickets...
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-8 text-gray-400">
                      No tickets found. Click &quot;+ New Ticket&quot; to create one.
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4 text-gray-500">{ticket.id}</td>
                      <td className="px-6 py-4 font-medium text-gray-800">
                        {ticket.ticket_no}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {ticket.branch_name || ticket.branch_id}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {ticket.route_name || ticket.route_id}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{ticket.ticket_date}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {ticket.departure || "-"}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">
                        {ticket.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">
                        {(ticket.discount || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-800">
                        {ticket.net_amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {ticket.payment_mode_name || ticket.payment_mode_id}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                            ticket.is_cancelled
                              ? "bg-red-50 text-red-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {ticket.is_cancelled ? "Cancelled" : "Active"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-3">
                        <button
                          onClick={() => handleView(ticket)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(ticket)}
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
                  : `${(page - 1) * pageSize + 1}\u2013${Math.min(
                      page * pageSize,
                      totalCount
                    )} of ${totalCount}`}
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
          {viewTicket && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Ticket Details - #{viewTicket.id}
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">ID</span>
                    <span className="text-sm text-gray-800">{viewTicket.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Ticket No</span>
                    <span className="text-sm text-gray-800">{viewTicket.ticket_no}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Branch</span>
                    <span className="text-sm text-gray-800">
                      {viewTicket.branch_name || viewTicket.branch_id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Route</span>
                    <span className="text-sm text-gray-800">
                      {viewTicket.route_name || viewTicket.route_id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Ticket Date</span>
                    <span className="text-sm text-gray-800">
                      {viewTicket.ticket_date}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Departure</span>
                    <span className="text-sm text-gray-800">
                      {viewTicket.departure || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Amount</span>
                    <span className="text-sm text-gray-800">
                      {viewTicket.amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Discount</span>
                    <span className="text-sm text-gray-800">
                      {(viewTicket.discount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Net Amount</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {viewTicket.net_amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Payment Mode
                    </span>
                    <span className="text-sm text-gray-800">
                      {viewTicket.payment_mode_name || viewTicket.payment_mode_id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Status</span>
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                        viewTicket.is_cancelled
                          ? "bg-red-50 text-red-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {viewTicket.is_cancelled ? "Cancelled" : "Active"}
                    </span>
                  </div>
                </div>

                {/* Ticket Items table */}
                {viewTicket.items && viewTicket.items.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-700 mb-2">
                      Ticket Items
                    </h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-2 font-semibold text-gray-600">
                              Item
                            </th>
                            <th className="text-right px-4 py-2 font-semibold text-gray-600">
                              Rate
                            </th>
                            <th className="text-right px-4 py-2 font-semibold text-gray-600">
                              Levy
                            </th>
                            <th className="text-right px-4 py-2 font-semibold text-gray-600">
                              Qty
                            </th>
                            <th className="text-left px-4 py-2 font-semibold text-gray-600">
                              Vehicle No
                            </th>
                            <th className="text-right px-4 py-2 font-semibold text-gray-600">
                              Amount
                            </th>
                            <th className="text-left px-4 py-2 font-semibold text-gray-600">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewTicket.items.map((ti) => (
                            <tr
                              key={ti.id}
                              className={`border-b border-gray-100 ${
                                ti.is_cancelled ? "opacity-50" : ""
                              }`}
                            >
                              <td className="px-4 py-2 text-gray-800">
                                {ti.item_name || ti.item_id}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-600">
                                {ti.rate.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-600">
                                {ti.levy.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-600">
                                {ti.quantity}
                              </td>
                              <td className="px-4 py-2 text-gray-600">
                                {ti.vehicle_no || "-"}
                              </td>
                              <td className="px-4 py-2 text-right font-medium text-gray-800">
                                {ti.amount.toFixed(2)}
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    ti.is_cancelled
                                      ? "bg-red-50 text-red-700"
                                      : "bg-green-50 text-green-700"
                                  }`}
                                >
                                  {ti.is_cancelled ? "Cancelled" : "Active"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => setViewTicket(null)}
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
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {editingTicket
                    ? `Edit Ticket #${editingTicket.id}`
                    : "New Ticket"}
                </h3>
                <form onSubmit={handleSubmit}>
                  {/* Master section */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {/* Branch */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Branch *
                      </label>
                      <select
                        required
                        value={formBranchId}
                        onChange={(e) => handleBranchChange(Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={0}>-- Select Branch --</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Route */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Route *
                      </label>
                      <select
                        required
                        value={formRouteId}
                        onChange={async (e) => {
                          const newRouteId = Number(e.target.value);
                          setFormRouteId(newRouteId);
                          if (newRouteId) {
                            const updatedItems = await Promise.all(
                              formItems.map(async (fi) => {
                                if (!fi.item_id || fi.is_cancelled) return fi;
                                try {
                                  const res = await api.get<RateLookupResponse>(
                                    `/api/tickets/rate-lookup?item_id=${fi.item_id}&route_id=${newRouteId}`
                                  );
                                  return { ...fi, rate: res.data.rate, levy: res.data.levy };
                                } catch {
                                  return { ...fi, rate: 0, levy: 0 };
                                }
                              })
                            );
                            setFormItems(updatedItems);
                          }
                        }}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={0}>-- Select Route --</option>
                        {filteredRoutes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.branch_one_name} - {r.branch_two_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Ticket Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ticket Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={formTicketDate}
                        onChange={(e) => setFormTicketDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Departure */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Departure
                      </label>
                      <select
                        value={formDeparture}
                        onChange={(e) => setFormDeparture(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Select Departure --</option>
                        {departureOptions.map((d) => (
                          <option key={d.id} value={d.departure}>
                            {d.departure}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Payment Mode */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Mode *
                      </label>
                      <select
                        required
                        value={formPaymentModeId}
                        onChange={(e) =>
                          setFormPaymentModeId(Number(e.target.value))
                        }
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={0}>-- Select Payment Mode --</option>
                        {paymentModes.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.description}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Discount */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Discount
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formDiscount}
                        onChange={(e) =>
                          setFormDiscount(parseFloat(e.target.value) || 0)
                        }
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Amount (read-only) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Amount
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formAmount.toFixed(2)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black bg-gray-100 cursor-not-allowed focus:outline-none"
                      />
                    </div>

                    {/* Net Amount (read-only) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Net Amount
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formNetAmount.toFixed(2)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black bg-gray-100 cursor-not-allowed focus:outline-none"
                      />
                    </div>

                    {/* Ticket No (read-only, edit mode only) */}
                    {editingTicket && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Ticket No
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={editingTicket.ticket_no}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black bg-gray-100 cursor-not-allowed focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Detail section - Ticket Items */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-gray-700">Ticket Items</h4>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="text-sm bg-blue-700 hover:bg-blue-800 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-2 font-semibold text-gray-600">
                              Item
                            </th>
                            <th className="text-right px-4 py-2 font-semibold text-gray-600">
                              Rate
                            </th>
                            <th className="text-right px-4 py-2 font-semibold text-gray-600">
                              Levy
                            </th>
                            <th className="text-right px-4 py-2 font-semibold text-gray-600 w-20">
                              Qty
                            </th>
                            <th className="text-left px-4 py-2 font-semibold text-gray-600">
                              Vehicle No
                            </th>
                            <th className="text-right px-4 py-2 font-semibold text-gray-600">
                              Amount
                            </th>
                            <th className="text-center px-4 py-2 font-semibold text-gray-600">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {formItems.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="text-center py-4 text-gray-400"
                              >
                                No items added. Click &quot;+ Add Item&quot; to add one.
                              </td>
                            </tr>
                          ) : (
                            formItems.map((fi) => {
                              const rowAmount = fi.is_cancelled
                                ? 0
                                : fi.quantity * (fi.rate + fi.levy);
                              return (
                                <tr
                                  key={fi.tempId}
                                  className={`border-b border-gray-100 ${
                                    fi.is_cancelled ? "opacity-40 bg-gray-50" : ""
                                  }`}
                                >
                                  <td className="px-4 py-2">
                                    <select
                                      value={fi.item_id}
                                      disabled={fi.is_cancelled}
                                      onChange={(e) =>
                                        handleItemChange(
                                          fi.tempId,
                                          Number(e.target.value)
                                        )
                                      }
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    >
                                      <option value={0}>-- Select --</option>
                                      {items.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={fi.rate.toFixed(2)}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right bg-gray-100 cursor-not-allowed focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={fi.levy.toFixed(2)}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right bg-gray-100 cursor-not-allowed focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="number"
                                      min="1"
                                      disabled={fi.is_cancelled}
                                      value={fi.quantity}
                                      onChange={(e) =>
                                        setFormItems((prev) =>
                                          prev.map((item) =>
                                            item.tempId === fi.tempId
                                              ? {
                                                  ...item,
                                                  quantity:
                                                    parseInt(e.target.value) || 1,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      disabled={fi.is_cancelled}
                                      value={fi.vehicle_no}
                                      onChange={(e) =>
                                        setFormItems((prev) =>
                                          prev.map((item) =>
                                            item.tempId === fi.tempId
                                              ? {
                                                  ...item,
                                                  vehicle_no: e.target.value,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      placeholder="Optional"
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={rowAmount.toFixed(2)}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right bg-gray-100 cursor-not-allowed focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    {fi.is_cancelled ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRestoreItem(fi.tempId)}
                                        className="text-green-600 hover:text-green-800 font-medium text-xs transition"
                                      >
                                        Restore
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleCancelItem(fi.tempId)}
                                        className="text-red-600 hover:text-red-800 font-medium text-xs transition"
                                      >
                                        Cancel
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {formError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-4">
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
                        : editingTicket
                          ? "Update Ticket"
                          : "Create Ticket"}
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
