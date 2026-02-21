"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { getSelectedBranchId, getSelectedBranchName } from "@/lib/auth";
import {
  User,
  Ticket,
  TicketCreate,
  TicketUpdate,
  TicketItemCreate,
  TicketItemUpdate,
  TicketPayementCreate,
  Branch,
  Route,
  Item,
  PaymentMode,
  FerrySchedule,
  RateLookupResponse,
} from "@/types";

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

function isFormRowInvalid(fi: FormItem, items: Item[]): boolean {
  if (fi.is_cancelled) return false;
  const def = items.find((i) => i.id === fi.item_id);
  if (!def || fi.quantity < 1) return true;
  if (def.is_vehicle && !fi.vehicle_no.trim()) return true;
  return false;
}

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

/* ── Searchable item dropdown ── */
function ItemSearchSelect({
  items,
  selectedId,
  disabled,
  onSelect,
  tabIndex,
}: {
  items: Item[];
  selectedId: number;
  disabled?: boolean;
  onSelect: (id: number) => void;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const selectedItem = items.find((i) => i.id === selectedId);

  const filtered = search.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  const handleSelect = (id: number) => {
    onSelect(id);
    setOpen(false);
    setSearch("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered.length > 0) {
        handleSelect(filtered[highlightIdx]?.id ?? 0);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightIdx(0);
      } else {
        setHighlightIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  if (disabled) {
    return (
      <input
        type="text"
        readOnly
        disabled
        value={selectedItem?.name ?? ""}
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm bg-gray-100 cursor-not-allowed focus:outline-none"
      />
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        tabIndex={tabIndex}
        value={open ? search : selectedItem?.name ?? ""}
        placeholder="-- Search item --"
        onFocus={() => {
          setOpen(true);
          setSearch("");
          setHighlightIdx(0);
        }}
        onChange={(e) => {
          setSearch(e.target.value);
          setHighlightIdx(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg text-sm"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">No items found</li>
          ) : (
            filtered.map((item, idx) => (
              <li
                key={item.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item.id);
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`px-3 py-1.5 cursor-pointer ${
                  idx === highlightIdx
                    ? "bg-blue-600 text-white"
                    : "text-black hover:bg-gray-100"
                }`}
              >
                {item.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function TicketingPage() {
  // Current user (needed for role checks and route restrictions)
  const [user, setUser] = useState<User | null>(null);

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
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // View modal
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);

  // Payment confirmation modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentRows, setPaymentRows] = useState<
    { tempId: string; payment_mode_id: number; amount: number; amountStr: string; reference_id: string }[]
  >([]);
  const [paymentError, setPaymentError] = useState("");

  // Last ticket info (fetched from API each time payment modal opens)
  const [lastTicketInfo, setLastTicketInfo] = useState<{
    paymentModes: string[];
    amount: number;
    repayment: number;
    refNo: string | null;
  } | null>(null);

  // Master form fields
  const [formBranchId, setFormBranchId] = useState(0);
  const [formRouteId, setFormRouteId] = useState(0);
  const [formTicketDate, setFormTicketDate] = useState("");
  const [formDeparture, setFormDeparture] = useState("");
  const [formPaymentModeId, setFormPaymentModeId] = useState(0);
  const [formDiscount, setFormDiscount] = useState(0);
  const [discountStr, setDiscountStr] = useState("0.00");

  // Detail items
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const formItemsRef = useRef<FormItem[]>([]);
  useEffect(() => { formItemsRef.current = formItems; }, [formItems]);

  // All ferry schedules (loaded once)
  const [ferrySchedules, setFerrySchedules] = useState<FerrySchedule[]>([]);

  // Computed amounts
  const [formAmount, setFormAmount] = useState(0);
  const [formNetAmount, setFormNetAmount] = useState(0);

  // Filtered branches based on selected route
  const [filteredBranches, setFilteredBranches] = useState<Branch[]>([]);

  // Departure select ref for auto-focus
  const departureRef = useRef<HTMLSelectElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // Auto-focus departure when modal opens
  useEffect(() => {
    if (showModal) {
      setTimeout(() => departureRef.current?.focus(), 50);
    }
  }, [showModal]);

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
    api
      .get<User>("/api/auth/me")
      .then(async ({ data }) => {
        setUser(data);
        // Fetch dropdown data in parallel
        try {
          const [branchRes, routeRes, itemRes, pmRes, schedRes] = await Promise.all([
            api.get<Branch[]>("/api/branches/?limit=200&status=active"),
            api.get<Route[]>("/api/routes/?limit=200&status=active"),
            api.get<Item[]>("/api/items/?limit=200&status=active"),
            api.get<PaymentMode[]>("/api/payment-modes/?limit=200&status=active"),
            api.get<FerrySchedule[]>("/api/ferry-schedules/?limit=200"),
          ]);
          setBranches(branchRes.data);
          setAllRoutes(routeRes.data);
          setItems(itemRes.data);
          setPaymentModes(pmRes.data);
          setFerrySchedules(schedRes.data);
        } catch {
          /* dropdown load failure is non-fatal */
        }
        return fetchTickets();
      })
      .catch(() => { /* handled by layout auth */ });
  }, [fetchTickets]);

  // Whether the user is locked to their assigned route
  const isRouteRestricted = user?.route_id != null;

  // Route change handler for modal (unrestricted users)
  const handleRouteChange = (routeId: number) => {
    setFormRouteId(routeId);
    setFormBranchId(0);
    setFormDeparture("");
    if (routeId) {
      const route = allRoutes.find((r) => r.id === routeId);
      if (route) {
        setFilteredBranches(
          branches.filter(
            (b) => b.id === route.branch_id_one || b.id === route.branch_id_two
          )
        );
      }
    } else {
      setFilteredBranches([]);
    }
  };

  // Branch change handler
  const handleBranchChange = (branchId: number) => {
    setFormBranchId(branchId);
    setFormDeparture(branchId ? getNextDeparture(branchId) : "");
  };

  // Item change handler for detail rows
  const handleItemChange = async (tempId: string, itemId: number) => {
    const selectedItem = items.find((i) => i.id === itemId);
    const vehicleNo = selectedItem?.is_vehicle ? undefined : "";
    const updated = formItems.map((fi) =>
      fi.tempId === tempId
        ? { ...fi, item_id: itemId, rate: 0, levy: 0, ...(vehicleNo !== undefined ? { vehicle_no: vehicleNo } : {}) }
        : fi
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
  const handleAddItem = useCallback(() => {
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
  }, []);

  // Alt+A to add item row, Alt+D to cancel/remove focused row
  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyA") {
        e.preventDefault();
        e.stopPropagation();
        // Don't add a new row if any existing row is invalid
        if (formItemsRef.current.some((fi) => isFormRowInvalid(fi, itemsRef.current))) return;
        handleAddItem();
        setTimeout(() => {
          const input = modalRef.current?.querySelector<HTMLInputElement>(
            'tbody tr:last-child td:first-child input[type="number"]'
          );
          input?.focus();
        }, 50);
      }
      if (e.altKey && e.code === "KeyS") {
        e.preventDefault();
        e.stopPropagation();
        submitRef.current?.click();
      }
      if (e.altKey && e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        const row = (document.activeElement as HTMLElement)?.closest("tbody tr");
        if (!row) return;
        const rows = Array.from(modalRef.current?.querySelectorAll("tbody tr") || []);
        const rowIdx = rows.indexOf(row);
        if (rowIdx === -1) return;
        setFormItems((prev) => {
          const fi = prev[rowIdx];
          if (!fi || fi.is_cancelled) return prev;
          if (editingTicket && fi.id) {
            return prev.map((item, i) =>
              i === rowIdx ? { ...item, is_cancelled: true } : item
            );
          }
          return prev.filter((_, i) => i !== rowIdx);
        });
        // Move focus to previous row's first input, or next row
        setTimeout(() => {
          const remainingRows = modalRef.current?.querySelectorAll("tbody tr");
          if (!remainingRows || remainingRows.length === 0) return;
          const targetIdx = Math.min(rowIdx, remainingRows.length - 1);
          const input = remainingRows[targetIdx]?.querySelector<HTMLInputElement>('input[type="number"]');
          input?.focus();
        }, 50);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [showModal, handleAddItem, editingTicket]);

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

  // Find the next departure time relative to now; wraps to first if past all
  const getNextDeparture = (branchId: number): string => {
    const branchSchedules = ferrySchedules
      .filter((fs) => fs.branch_id === branchId)
      .map((fs) => fs.departure)
      .sort();
    if (branchSchedules.length === 0) return "";
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const next = branchSchedules.find((d) => d >= nowStr);
    return next || branchSchedules[0];
  };

  // Open create modal
  const openCreateModal = async () => {
    setEditingTicket(null);
    setFormTicketDate(new Date().toISOString().split("T")[0]);
    setFormDeparture("");
    setFormPaymentModeId(paymentModes.length > 0 ? paymentModes[0].id : 0);
    setFormDiscount(0);
    setDiscountStr("0.00");
    setFormItems([{
      tempId: crypto.randomUUID(),
      id: null,
      item_id: 0,
      rate: 0,
      levy: 0,
      quantity: 1,
      vehicle_no: "",
      is_cancelled: false,
    }]);
    setFormError("");

    if (isRouteRestricted) {
      // Restricted user: lock route and branch
      const selectedBranchId = getSelectedBranchId();
      setFormRouteId(user!.route_id!);
      setFormBranchId(selectedBranchId || 0);
      setFilteredBranches([]);
      if (selectedBranchId) {
        setFormDeparture(getNextDeparture(selectedBranchId));
      }
    } else {
      // Unrestricted user: start with empty selections
      setFormRouteId(0);
      setFormBranchId(0);
      setFilteredBranches([]);
    }

    // Fetch last ticket info from API
    setLastTicketInfo(null);
    try {
      const listRes = await api.get<Ticket[]>("/api/tickets/?limit=1&sort_by=id&sort_order=desc");
      if (listRes.data.length > 0) {
        const lastId = listRes.data[0].id;
        const detailRes = await api.get<Ticket>(`/api/tickets/${lastId}`);
        const t = detailRes.data;
        const totalPaid = (t.payments || []).reduce((s, p) => s + p.amount, 0);
        const change = Math.round((totalPaid - t.net_amount) * 100) / 100;
        const modes = [...new Set((t.payments || []).map((p) => p.payment_mode_name || "-"))];
        const upiPayment = (t.payments || []).find(
          (p) => p.payment_mode_name?.toUpperCase() === "UPI"
        );
        setLastTicketInfo({
          paymentModes: modes.length > 0 ? modes : [t.payment_mode_name || "-"],
          amount: t.net_amount,
          repayment: change,
          refNo: upiPayment?.ref_no || null,
        });
      }
    } catch {
      /* non-fatal */
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
    setDiscountStr("0.00");
    setFormItems([]);
    setFilteredBranches([]);
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
      setFormTicketDate(t.ticket_date);
      setFormDeparture(t.departure || "");
      setFormPaymentModeId(t.payment_mode_id);
      setFormDiscount(t.discount || 0);
      setDiscountStr((t.discount || 0).toFixed(2));

      if (isRouteRestricted) {
        // Restricted user: lock to assigned route and login branch
        const selectedBranchId = getSelectedBranchId();
        setFormRouteId(user!.route_id!);
        setFormBranchId(selectedBranchId || t.branch_id);
        setFilteredBranches([]);
      } else {
        // Unrestricted user: pre-fill from ticket, filter branches by route
        setFormRouteId(t.route_id);
        setFormBranchId(t.branch_id);
        const route = allRoutes.find((r) => r.id === t.route_id);
        if (route) {
          setFilteredBranches(
            branches.filter(
              (b) => b.id === route.branch_id_one || b.id === route.branch_id_two
            )
          );
        }
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
    if (!formBranchId || !formRouteId) {
      setFormError("Branch and Route are required.");
      return;
    }
    if (activeItems.some((fi) => !fi.item_id)) {
      setFormError("All items must have an item selected.");
      return;
    }

    if (editingTicket) {
      // Edit mode: save directly
      setSubmitting(true);
      try {
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
    } else {
      // Create mode: show payment confirmation modal
      const cashMode = paymentModes.find((pm) => pm.description.toUpperCase() === "CASH");
      setPaymentRows([
        {
          tempId: crypto.randomUUID(),
          payment_mode_id: cashMode?.id || (paymentModes.length > 0 ? paymentModes[0].id : 0),
          amount: formNetAmount,
          amountStr: formNetAmount.toFixed(2),
          reference_id: "",
        },
      ]);
      setPaymentError("");
      setShowPaymentModal(true);
    }
  };

  // Computed received amount from payment rows
  const receivedAmount = paymentRows.reduce((sum, pr) => sum + pr.amount, 0);
  const receivedAmountRounded = Math.round(receivedAmount * 100) / 100;

  // Save and print handler (called from payment modal)
  const handleSaveAndPrint = async () => {
    // Validate payment rows
    if (paymentRows.length === 0) {
      setPaymentError("At least one payment row is required.");
      return;
    }
    if (paymentRows.some((pr) => !pr.payment_mode_id)) {
      setPaymentError("All payment rows must have a payment mode selected.");
      return;
    }
    if (paymentRows.some((pr) => pr.amount <= 0)) {
      setPaymentError("All payment amounts must be greater than zero.");
      return;
    }
    // Check UPI rows have reference_id
    const upiMode = paymentModes.find((pm) => pm.description.toUpperCase() === "UPI");
    if (upiMode && paymentRows.some((pr) => pr.payment_mode_id === upiMode.id && !pr.reference_id.trim())) {
      setPaymentError("Reference ID is required for UPI payments.");
      return;
    }
    if (receivedAmountRounded < formNetAmount) {
      setPaymentError("Total received amount cannot be less than net amount.");
      return;
    }
    setPaymentError("");
    setSubmitting(true);
    try {
      const activeItems = formItems.filter((fi) => !fi.is_cancelled);
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
        payments: paymentRows.map((pr): TicketPayementCreate => ({
          payment_mode_id: pr.payment_mode_id,
          amount: pr.amount,
          ref_no: pr.reference_id.trim() || null,
        })),
      };
      const res = await api.post<Ticket>("/api/tickets/", create);
      const savedTicket = res.data;

      // Build print content
      const routeName = allRoutes.find((r) => r.id === formRouteId);
      const branchName = branches.find((b) => b.id === formBranchId)?.name || "";
      const repayment = Math.round((receivedAmountRounded - formNetAmount) * 100) / 100;
      const itemRows = activeItems
        .map((fi) => {
          const itemName = items.find((i) => i.id === fi.item_id)?.name || `Item #${fi.item_id}`;
          const lineAmt = (fi.quantity * (fi.rate + fi.levy)).toFixed(2);
          return `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${itemName}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${fi.rate.toFixed(2)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${fi.levy.toFixed(2)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;">${fi.quantity}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${fi.vehicle_no || "-"}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${lineAmt}</td>
          </tr>`;
        })
        .join("");

      const paymentPrintRows = paymentRows
        .map((pr) => {
          const modeName = paymentModes.find((pm) => pm.id === pr.payment_mode_id)?.description || "-";
          return `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${modeName}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${pr.amount.toFixed(2)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${pr.reference_id || "-"}</td>
          </tr>`;
        })
        .join("");

      const printHtml = `<!DOCTYPE html>
<html><head><title>Ticket #${savedTicket.ticket_no || savedTicket.id}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
  .header { text-align: center; margin-bottom: 16px; }
  .header h2 { margin: 0 0 4px; font-size: 18px; }
  .header p { margin: 0; font-size: 12px; color: #666; }
  .info { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 12px; font-size: 13px; }
  .info span { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
  th { background: #f5f5f5; padding: 6px 8px; text-align: left; border-bottom: 2px solid #ddd; }
  .totals { text-align: right; font-size: 13px; margin-top: 8px; }
  .totals div { margin-bottom: 4px; }
  .totals .net { font-size: 15px; font-weight: 700; }
  .section-title { font-size: 13px; font-weight: 700; margin: 12px 0 6px; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="header">
  <h2>SSMSPL - Ferry Ticket</h2>
  <p>Suvarnadurga Shipping & Marine Services Pvt. Ltd.</p>
</div>
<div class="info">
  <div>Ticket No: <span>${savedTicket.ticket_no || savedTicket.id}</span></div>
  <div>Date: <span>${formTicketDate}</span></div>
  <div>Branch: <span>${branchName}</span></div>
  <div>Route: <span>${routeName ? `${routeName.branch_one_name} - ${routeName.branch_two_name}` : ""}</span></div>
  <div>Departure: <span>${formDeparture || "-"}</span></div>
</div>
<table>
  <thead><tr>
    <th>Item</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Levy</th>
    <th style="text-align:center;">Qty</th><th>Vehicle</th><th style="text-align:right;">Amount</th>
  </tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="totals">
  <div>Amount: ${formAmount.toFixed(2)}</div>
  <div>Discount: ${(formDiscount || 0).toFixed(2)}</div>
  <div class="net">Net Amount: ${formNetAmount.toFixed(2)}</div>
</div>
<div class="section-title">Payment Details</div>
<table>
  <thead><tr>
    <th>Payment Mode</th><th style="text-align:right;">Amount</th><th>Reference ID</th>
  </tr></thead>
  <tbody>${paymentPrintRows}</tbody>
  <tfoot><tr>
    <td style="padding:4px 8px;font-weight:700;">Total Received</td>
    <td style="padding:4px 8px;text-align:right;font-weight:700;">${receivedAmountRounded.toFixed(2)}</td>
    <td></td>
  </tr></tfoot>
</table>
<div class="totals">
  <div>Return Change: ${repayment.toFixed(2)}</div>
</div>
</body></html>`;

      const printWindow = window.open("", "_blank", "width=600,height=700");
      if (printWindow) {
        printWindow.document.write(printHtml);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }

      setShowPaymentModal(false);
      closeModal();
      await fetchTickets();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Operation failed.";
      setPaymentError(msg);
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

  return (
    <>
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
                  {/* Payment Mode column hidden for now */}
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
                    <td colSpan={11} className="text-center py-8 text-gray-400">
                      Loading tickets...
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-gray-400">
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
                      {/* Payment Mode cell hidden for now */}
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
                        {(user?.role === "SUPER_ADMIN" || user?.role === "ADMIN") && (
                          <button
                            onClick={() => handleEdit(ticket)}
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm transition"
                          >
                            Edit
                          </button>
                        )}
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
                  {/* Payment Mode hidden for now */}
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

          {/* Payment Confirmation Modal */}
          {showPaymentModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold text-gray-800 mb-6">
                  Payment Confirmation
                </h3>

                <div className="space-y-4">
                  {/* Net Amount (display only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Net Amount
                    </label>
                    <div className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-800 text-right font-semibold text-lg bg-gray-50">
                      {formNetAmount.toFixed(2)}
                    </div>
                  </div>

                  {/* Payment Table */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-600">
                        Payment Details
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const cashMode = paymentModes.find((pm) => pm.description.toUpperCase() === "CASH");
                          setPaymentRows((prev) => [
                            ...prev,
                            {
                              tempId: crypto.randomUUID(),
                              payment_mode_id: cashMode?.id || (paymentModes.length > 0 ? paymentModes[0].id : 0),
                              amount: 0,
                              amountStr: "0.00",
                              reference_id: "",
                            },
                          ]);
                        }}
                        className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        + Add Row
                      </button>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600 w-[150px]">
                              Payment Mode
                            </th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-600 w-[140px]">
                              Amount
                            </th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">
                              Reference ID
                            </th>
                            <th className="text-center px-3 py-2 font-semibold text-gray-600 w-[70px]">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentRows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center py-4 text-gray-400">
                                No payment rows. Click &quot;+ Add Row&quot; to add one.
                              </td>
                            </tr>
                          ) : (
                            paymentRows.map((pr) => {
                              const selectedMode = paymentModes.find((pm) => pm.id === pr.payment_mode_id);
                              const isUpi = selectedMode?.description.toUpperCase() === "UPI";
                              return (
                                <tr key={pr.tempId} className="border-b border-gray-100">
                                  <td className="px-3 py-2">
                                    <select
                                      value={pr.payment_mode_id}
                                      onChange={(e) => {
                                        const modeId = Number(e.target.value);
                                        setPaymentRows((prev) =>
                                          prev.map((row) =>
                                            row.tempId === pr.tempId
                                              ? { ...row, payment_mode_id: modeId, reference_id: "" }
                                              : row
                                          )
                                        );
                                      }}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      <option value={0}>-- Select --</option>
                                      {paymentModes.map((pm) => (
                                        <option key={pm.id} value={pm.id}>
                                          {pm.description}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      autoFocus={paymentRows.length === 1 && paymentRows[0].tempId === pr.tempId}
                                      value={pr.amountStr}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                                          setPaymentRows((prev) =>
                                            prev.map((row) =>
                                              row.tempId === pr.tempId
                                                ? { ...row, amountStr: val, amount: parseFloat(val) || 0 }
                                                : row
                                            )
                                          );
                                        }
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      onBlur={() =>
                                        setPaymentRows((prev) =>
                                          prev.map((row) =>
                                            row.tempId === pr.tempId
                                              ? { ...row, amountStr: row.amount.toFixed(2) }
                                              : row
                                          )
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleSaveAndPrint();
                                        }
                                      }}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      disabled={!isUpi}
                                      placeholder={isUpi ? "Transaction ID" : "-"}
                                      value={pr.reference_id}
                                      onChange={(e) =>
                                        setPaymentRows((prev) =>
                                          prev.map((row) =>
                                            row.tempId === pr.tempId
                                              ? { ...row, reference_id: e.target.value }
                                              : row
                                          )
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleSaveAndPrint();
                                        }
                                      }}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPaymentRows((prev) =>
                                          prev.filter((row) => row.tempId !== pr.tempId)
                                        )
                                      }
                                      className="text-red-600 hover:text-red-800 font-medium text-xs transition"
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Received Amount (computed from payment rows) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Received Amount
                    </label>
                    <div
                      className={`w-full border border-gray-200 rounded-lg px-4 py-2.5 text-right font-semibold text-lg bg-gray-50 ${
                        receivedAmountRounded >= formNetAmount
                          ? "text-gray-800"
                          : "text-red-600"
                      }`}
                    >
                      {receivedAmountRounded.toFixed(2)}
                    </div>
                  </div>

                  {/* Re-Payment / Change Amount (display only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Re-Payment Amount (Change)
                    </label>
                    <div
                      className={`w-full border border-gray-200 rounded-lg px-4 py-2.5 text-right font-semibold text-lg bg-gray-50 ${
                        receivedAmountRounded >= formNetAmount
                          ? "text-green-700"
                          : "text-red-600"
                      }`}
                    >
                      {(Math.round((receivedAmountRounded - formNetAmount) * 100) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>

                {paymentError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mt-4">
                    {paymentError}
                  </p>
                )}

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndPrint}
                    disabled={submitting || receivedAmountRounded < formNetAmount}
                    className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Saving..." : "Save & Print"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create/Edit Modal */}
          {showModal && (
            <div className="fixed inset-0 z-50">
              <div
                ref={modalRef}
                className="bg-white w-full h-full p-6 overflow-y-auto"
                onFocusCapture={(e) => {
                  const el = e.target;
                  if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "number" || el.type === "date")) {
                    el.select();
                  }
                }}
                onKeyDownCapture={(e) => {
                  if ((e.key === "ArrowUp" || e.key === "ArrowDown") && (e.target as HTMLElement)?.tagName === "INPUT" && (e.target as HTMLInputElement).type === "number") {
                    e.preventDefault();
                  }
                }}
                onWheelCapture={(e) => {
                  if ((e.target as HTMLElement)?.tagName === "INPUT" && (e.target as HTMLInputElement).type === "number") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Tab") return;
                  e.preventDefault();
                  const container = e.currentTarget;
                  const focusable = Array.from(
                    container.querySelectorAll<HTMLElement>(
                      'input:not([disabled]):not([readonly]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"])'
                    )
                  );
                  if (focusable.length === 0) return;
                  const idx = focusable.indexOf(document.activeElement as HTMLElement);
                  if (e.shiftKey) {
                    focusable[idx <= 0 ? focusable.length - 1 : idx - 1].focus();
                  } else {
                    focusable[idx === -1 || idx >= focusable.length - 1 ? 0 : idx + 1].focus();
                  }
                }}
              >
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {editingTicket
                    ? `Edit Ticket #${editingTicket.id}`
                    : "New Ticket"}
                </h3>
                <form onSubmit={handleSubmit}>
                  {/* Master section */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {/* Route */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Route *
                      </label>
                      {isRouteRestricted || editingTicket ? (
                        <input
                          type="text"
                          readOnly
                          value={
                            allRoutes.find((r) => r.id === formRouteId)
                              ? `${allRoutes.find((r) => r.id === formRouteId)!.branch_one_name} - ${allRoutes.find((r) => r.id === formRouteId)!.branch_two_name}`
                              : `Route #${formRouteId}`
                          }
                          tabIndex={-1}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black bg-gray-100 cursor-not-allowed focus:outline-none"
                        />
                      ) : (
                        <select
                          required
                          value={formRouteId}
                          onChange={async (e) => {
                            const newRouteId = Number(e.target.value);
                            handleRouteChange(newRouteId);
                            if (newRouteId && formItems.length > 0) {
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
                          {allRoutes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.branch_one_name} - {r.branch_two_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Branch */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Branch *
                      </label>
                      {isRouteRestricted || editingTicket ? (
                        <input
                          type="text"
                          readOnly
                          value={
                            branches.find((b) => b.id === formBranchId)?.name ||
                            getSelectedBranchName() ||
                            `Branch #${formBranchId}`
                          }
                          tabIndex={-1}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black bg-gray-100 cursor-not-allowed focus:outline-none"
                        />
                      ) : (
                        <select
                          required
                          value={formBranchId}
                          onChange={(e) => handleBranchChange(Number(e.target.value))}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={0}>-- Select Branch --</option>
                          {filteredBranches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Ticket Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ticket Date *
                      </label>
                      <input
                        type="date"
                        required
                        readOnly={user?.role === "BILLING_OPERATOR"}
                        tabIndex={user?.role === "BILLING_OPERATOR" ? -1 : undefined}
                        value={formTicketDate}
                        onChange={(e) => setFormTicketDate(e.target.value)}
                        className={`w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none ${
                          user?.role === "BILLING_OPERATOR"
                            ? "bg-gray-100 cursor-not-allowed"
                            : "focus:ring-2 focus:ring-blue-500"
                        }`}
                      />
                    </div>

                    {/* Departure */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Departure
                      </label>
                      <select
                        ref={departureRef}
                        value={formDeparture}
                        onChange={(e) => setFormDeparture(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Select Departure --</option>
                        {ferrySchedules
                          .filter((fs) => !formBranchId || fs.branch_id === formBranchId)
                          .map((fs) => (
                            <option key={fs.id} value={fs.departure}>
                              {fs.departure}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Payment Mode hidden for now */}

                    {/* Ticket No (read-only, edit mode only) */}
                    {editingTicket && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Ticket No
                        </label>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={editingTicket.ticket_no}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black bg-gray-100 cursor-not-allowed focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Detail section - Ticket Items */}
                  <div className="mb-4">
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600 w-[70px]">
                              ID
                            </th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600 w-[30%]">
                              Item
                            </th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-600 w-[100px]">
                              Rate
                            </th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-600 w-[100px]">
                              Levy
                            </th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-600 w-[70px]">
                              Qty
                            </th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600 w-[140px]">
                              Vehicle No
                            </th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-600 w-[110px]">
                              Amount
                            </th>
                            <th className="text-center px-3 py-2 w-[100px]">
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={handleAddItem}
                                disabled={formItems.some((fi) => isFormRowInvalid(fi, items))}
                                className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                + Add Item
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {formItems.length === 0 ? (
                            <tr>
                              <td
                                colSpan={8}
                                className="text-center py-4 text-gray-400"
                              >
                                No items added. Click &quot;+ Add Item&quot; to add one.
                              </td>
                            </tr>
                          ) : (
                            formItems.map((fi) => {
                              const selectedItem = items.find((i) => i.id === fi.item_id);
                              const isVehicle = selectedItem?.is_vehicle === true;
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
                                  <td className="px-3 py-2">
                                    <input
                                      type="number"
                                      min="1"
                                      disabled={fi.is_cancelled}
                                      value={fi.item_id || ""}
                                      placeholder="ID"
                                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                                      onChange={(e) => {
                                        const id = parseInt(e.target.value) || 0;
                                        if (id && items.some((i) => i.id === id)) {
                                          handleItemChange(fi.tempId, id);
                                        } else {
                                          setFormItems((prev) =>
                                            prev.map((item) =>
                                              item.tempId === fi.tempId
                                                ? { ...item, item_id: id, rate: 0, levy: 0 }
                                                : item
                                            )
                                          );
                                        }
                                      }}

                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <ItemSearchSelect
                                      items={items}
                                      selectedId={fi.item_id}
                                      disabled={fi.is_cancelled}
                                      onSelect={(id) => handleItemChange(fi.tempId, id)}
                                      tabIndex={fi.item_id && items.some((i) => i.id === fi.item_id) ? -1 : 0}
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      tabIndex={-1}
                                      type="text"
                                      readOnly
                                      value={fi.rate.toFixed(2)}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right bg-gray-100 cursor-not-allowed focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      tabIndex={-1}
                                      type="text"
                                      readOnly
                                      value={fi.levy.toFixed(2)}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right bg-gray-100 cursor-not-allowed focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      id={`qty-${fi.tempId}`}
                                      type="number"
                                      min="1"
                                      disabled={fi.is_cancelled}
                                      value={fi.quantity}
                                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
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
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      disabled={fi.is_cancelled || !isVehicle}
                                      readOnly={!isVehicle}
                                      tabIndex={!isVehicle ? -1 : undefined}
                                      value={fi.vehicle_no}
                                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
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
                                      placeholder={isVehicle ? "Vehicle No" : ""}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      tabIndex={-1}
                                      type="text"
                                      readOnly
                                      value={rowAmount.toFixed(2)}
                                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right bg-gray-100 cursor-not-allowed focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {fi.is_cancelled ? (
                                      <button
                                        type="button"
                                        tabIndex={-1}
                                        onClick={() => handleRestoreItem(fi.tempId)}
                                        className="text-green-600 hover:text-green-800 font-medium text-xs transition"
                                      >
                                        Restore
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        tabIndex={-1}
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
                        <tfoot className="border-t border-gray-200">
                          <tr>
                            <td colSpan={6} className="px-3 py-2 text-right text-sm font-medium text-gray-600">
                              Amount
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={formAmount.toFixed(2)}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right bg-gray-100 cursor-not-allowed focus:outline-none"
                              />
                            </td>
                            <td></td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="px-3 py-2 text-right text-sm font-medium text-gray-600">
                              Discount
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                tabIndex={-1}
                                value={discountStr}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                                    setDiscountStr(val);
                                    setFormDiscount(parseFloat(val) || 0);
                                  }
                                }}
                                onBlur={() => setDiscountStr(formDiscount.toFixed(2))}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td></td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="px-3 py-2 text-right text-sm font-semibold text-gray-800">
                              Net Amount
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={formNetAmount.toFixed(2)}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-right font-semibold bg-gray-100 cursor-not-allowed focus:outline-none"
                              />
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {formError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-4">
                      {formError}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    {/* Last ticket quick info */}
                    {!editingTicket && lastTicketInfo ? (
                      <div className="flex items-center gap-5 px-3 py-2 text-sm text-gray-600 border border-blue-200 rounded-lg bg-blue-50">
                        <span className="font-bold text-blue-700 uppercase tracking-wide">Last Ticket:</span>
                        <span>
                          Mode: <span className="font-bold text-gray-900">{lastTicketInfo.paymentModes.join(", ")}</span>
                        </span>
                        <span>
                          Amt: <span className="font-bold text-gray-900">{lastTicketInfo.amount.toFixed(2)}</span>
                        </span>
                        <span>
                          Change: <span className="font-bold text-gray-900">{lastTicketInfo.repayment.toFixed(2)}</span>
                        </span>
                        {lastTicketInfo.refNo && (
                          <span>
                            Ref: <span className="font-bold text-gray-900">{lastTicketInfo.refNo}</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div />
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={closeModal}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition"
                      >
                        Cancel
                      </button>
                      <button
                        ref={submitRef}
                        type="submit"
                        tabIndex={-1}
                        disabled={submitting || formItems.some((fi) => isFormRowInvalid(fi, items))}
                        className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                      {submitting
                        ? "Saving..."
                        : editingTicket
                          ? "Update Ticket"
                          : "Create Ticket"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
    </>
  );
}
