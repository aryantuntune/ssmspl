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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Printer } from "lucide-react";
import {
  printReceipt,
  ReceiptData,
  PaperWidth,
  getReceiptPaperWidth,
  setReceiptPaperWidth,
} from "@/lib/print-receipt";

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

/* -- Searchable item dropdown -- */
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

  // Receipt paper width
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(() => getReceiptPaperWidth());

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
          `/api/tickets/rate-lookup?item_id=${itemId}&route_id=${formRouteId}${formBranchId ? `&branch_id=${formBranchId}` : ""}`
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
        // New item in edit mode (no DB id) -- just remove
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

  // Reprint ticket
  const handleReprint = async (ticket: Ticket) => {
    try {
      const res = await api.get<Ticket>(`/api/tickets/${ticket.id}`);
      const t = res.data;

      // Determine From -> To direction
      const route = allRoutes.find((r) => r.id === t.route_id);
      let fromTo = "";
      if (route) {
        const isFromBranchOne = t.branch_id === route.branch_id_one;
        fromTo = isFromBranchOne
          ? `${route.branch_one_name} To ${route.branch_two_name}`
          : `${route.branch_two_name} To ${route.branch_one_name}`;
      }

      // Get branch info
      const branch = branches.find((b) => b.id === t.branch_id);
      const branchName = branch?.name || "";
      const branchPhone = branch?.contact_nos || "";

      // Build receipt data
      const receiptData: ReceiptData = {
        ticketId: t.id,
        ticketNo: t.ticket_no,
        branchName,
        branchPhone,
        fromTo,
        ticketDate: t.ticket_date,
        createdAt: t.created_at || null,
        departure: t.departure || null,
        items: (t.items || [])
          .filter((ti) => !ti.is_cancelled)
          .map((ti) => ({
            name: ti.item_name || items.find((i) => i.id === ti.item_id)?.name || `Item #${ti.item_id}`,
            quantity: ti.quantity,
            rate: ti.rate,
            levy: ti.levy,
            amount: ti.amount,
            vehicleNo: ti.vehicle_no || null,
          })),
        netAmount: t.net_amount,
        createdBy: user?.full_name || user?.username || "",
        paperWidth,
      };

      // Print receipt (non-blocking)
      printReceipt(receiptData).catch(() => {
        /* print failure is non-fatal */
      });
    } catch {
      setError("Failed to load ticket for reprinting.");
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

      // Determine From -> To direction
      const route = allRoutes.find((r) => r.id === formRouteId);
      let fromTo = "";
      if (route) {
        const isFromBranchOne = formBranchId === route.branch_id_one;
        fromTo = isFromBranchOne
          ? `${route.branch_one_name} To ${route.branch_two_name}`
          : `${route.branch_two_name} To ${route.branch_one_name}`;
      }

      // Get branch info
      const branch = branches.find((b) => b.id === formBranchId);
      const branchName = branch?.name || "";
      const branchPhone = branch?.contact_nos || "";

      // Build receipt data
      const receiptData: ReceiptData = {
        ticketId: savedTicket.id,
        ticketNo: savedTicket.ticket_no,
        branchName,
        branchPhone,
        fromTo,
        ticketDate: formTicketDate,
        createdAt: savedTicket.created_at || null,
        departure: formDeparture || null,
        items: activeItems.map((fi) => ({
          name: items.find((i) => i.id === fi.item_id)?.name || `Item #${fi.item_id}`,
          quantity: fi.quantity,
          rate: fi.rate,
          levy: fi.levy,
          amount: Math.round(fi.quantity * (fi.rate + fi.levy) * 100) / 100,
          vehicleNo: fi.vehicle_no || null,
        })),
        netAmount: formNetAmount,
        createdBy: user?.full_name || user?.username || "",
        paperWidth,
      };

      // Print receipt (non-blocking - ticket already saved)
      printReceipt(receiptData).catch(() => {
        /* print failure is non-fatal */
      });

      setShowPaymentModal(false);
      closeModal();
      await fetchTickets();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to save ticket. Please try again.";
      setPaymentError(msg);
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

  // DataTable columns
  const columns: Column<Ticket>[] = [
    {
      key: "id",
      label: "ID",
      sortable: true,
      render: (ticket) => <span className="text-muted-foreground">{ticket.id}</span>,
    },
    {
      key: "ticket_no",
      label: "Ticket No",
      sortable: true,
      render: (ticket) => <span className="font-medium">{ticket.ticket_no}</span>,
    },
    {
      key: "branch_id",
      label: "Branch",
      sortable: true,
      render: (ticket) => ticket.branch_name || ticket.branch_id,
    },
    {
      key: "route_id",
      label: "Route",
      sortable: true,
      render: (ticket) => ticket.route_name || ticket.route_id,
    },
    {
      key: "ticket_date",
      label: "Date",
      sortable: true,
    },
    {
      key: "departure",
      label: "Departure",
      sortable: true,
      render: (ticket) => ticket.departure || "-",
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      className: "text-right",
      render: (ticket) => ticket.amount.toFixed(2),
    },
    {
      key: "discount",
      label: "Discount",
      sortable: true,
      className: "text-right",
      render: (ticket) => (ticket.discount || 0).toFixed(2),
    },
    {
      key: "net_amount",
      label: "Net Amount",
      sortable: true,
      className: "text-right",
      render: (ticket) => <span className="font-medium">{ticket.net_amount.toFixed(2)}</span>,
    },
    {
      key: "is_cancelled",
      label: "Status",
      sortable: true,
      render: (ticket) => (
        <Badge variant={ticket.is_cancelled ? "destructive" : "default"}>
          {ticket.is_cancelled ? "Cancelled" : "Active"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (ticket) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleView(ticket)}>
            View
          </Button>
          {!ticket.is_cancelled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleReprint(ticket)}
              title="Reprint ticket"
            >
              <Printer className="h-4 w-4" />
            </Button>
          )}
          {user?.role === "ADMIN" && (
            <Button variant="ghost" size="sm" onClick={() => handleEdit(ticket)}>
              Edit
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ticket Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage ferry tickets</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" /> New Ticket
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            {/* ID filter operator */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">ID</Label>
              <div className="flex">
                <Select
                  value={idOp}
                  onValueChange={(val) => {
                    setIdOp(val);
                    if (val !== "between") {
                      setIdEndInput("");
                      setIdFilterEnd("");
                    }
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 w-[90px] rounded-r-none border-r-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eq">=</SelectItem>
                    <SelectItem value="lt">&lt;</SelectItem>
                    <SelectItem value="gt">&gt;</SelectItem>
                    <SelectItem value="between">Between</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
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
                  className={`w-20 rounded-l-none ${idOp !== "between" ? "" : "rounded-r-none border-r-0"}`}
                />
                {idOp === "between" && (
                  <>
                    <span className="flex items-center px-1.5 border-y border-input bg-muted text-muted-foreground text-xs">
                      &ndash;
                    </span>
                    <Input
                      type="number"
                      min={1}
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
                      className="w-20 rounded-l-none"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Ticket No filter */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Ticket No</Label>
              <Input
                type="number"
                min={1}
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
                className="w-28"
              />
            </div>

            {/* Branch filter */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Branch</Label>
              <Select
                value={branchFilter || "__all__"}
                onValueChange={(val) => {
                  setBranchFilter(val === "__all__" ? "" : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full sm:w-[160px]">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Route filter */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Route</Label>
              <Select
                value={routeFilter || "__all__"}
                onValueChange={(val) => {
                  setRouteFilter(val === "__all__" ? "" : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full sm:w-[200px]">
                  <SelectValue placeholder="All Routes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Routes</SelectItem>
                  {allRoutes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.branch_one_name} - {r.branch_two_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-[150px]"
              />
            </div>

            {/* Date To */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-[150px]"
              />
            </div>

            {/* Status filter */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
              <Select
                value={statusFilter || "__all__"}
                onValueChange={(val) => {
                  setStatusFilter(val === "__all__" ? "" : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full sm:w-[120px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <DataTable<Ticket>
        columns={columns}
        data={tickets}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No tickets found. Click "+ New Ticket" to create one.'
      />

      {/* View Modal (read-only popup) */}
      <Dialog open={!!viewTicket} onOpenChange={(open) => !open && setViewTicket(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ticket Details - #{viewTicket?.id}</DialogTitle>
          </DialogHeader>

          {viewTicket && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">ID</span>
                  <span className="text-sm">{viewTicket.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Ticket No</span>
                  <span className="text-sm">{viewTicket.ticket_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Branch</span>
                  <span className="text-sm">
                    {viewTicket.branch_name || viewTicket.branch_id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Route</span>
                  <span className="text-sm">
                    {viewTicket.route_name || viewTicket.route_id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Ticket Date</span>
                  <span className="text-sm">
                    {viewTicket.ticket_date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Departure</span>
                  <span className="text-sm">
                    {viewTicket.departure || "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Amount</span>
                  <span className="text-sm">
                    {viewTicket.amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Discount</span>
                  <span className="text-sm">
                    {(viewTicket.discount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Net Amount</span>
                  <span className="text-sm font-semibold">
                    {viewTicket.net_amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Status</span>
                  <Badge variant={viewTicket.is_cancelled ? "destructive" : "default"}>
                    {viewTicket.is_cancelled ? "Cancelled" : "Active"}
                  </Badge>
                </div>
              </div>

              {/* Ticket Items table */}
              {viewTicket.items && viewTicket.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold mb-2">Ticket Items</h4>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Levy</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Vehicle No</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewTicket.items.map((ti) => (
                          <TableRow
                            key={ti.id}
                            className={ti.is_cancelled ? "opacity-50" : ""}
                          >
                            <TableCell>{ti.item_name || ti.item_id}</TableCell>
                            <TableCell className="text-right">{ti.rate.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{ti.levy.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{ti.quantity}</TableCell>
                            <TableCell>{ti.vehicle_no || "-"}</TableCell>
                            <TableCell className="text-right font-medium">{ti.amount.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={ti.is_cancelled ? "destructive" : "default"}>
                                {ti.is_cancelled ? "Cancelled" : "Active"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewTicket(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Confirmation Modal */}
      <Dialog open={showPaymentModal} onOpenChange={(open) => !open && setShowPaymentModal(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Confirmation</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Net Amount (display only) */}
            <div>
              <Label>Net Amount</Label>
              <div className="w-full border border-border rounded-lg px-4 py-2.5 text-right font-semibold text-lg bg-muted">
                {formNetAmount.toFixed(2)}
              </div>
            </div>

            {/* Payment Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Payment Details</Label>
                <Button
                  type="button"
                  size="sm"
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
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Row
                </Button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[150px]">Payment Mode</TableHead>
                      <TableHead className="text-right w-[140px]">Amount</TableHead>
                      <TableHead>Reference ID</TableHead>
                      <TableHead className="text-center w-[70px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                          No payment rows. Click &quot;+ Add Row&quot; to add one.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paymentRows.map((pr) => {
                        const selectedMode = paymentModes.find((pm) => pm.id === pr.payment_mode_id);
                        const isUpi = selectedMode?.description.toUpperCase() === "UPI";
                        return (
                          <TableRow key={pr.tempId}>
                            <TableCell className="px-3 py-2">
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
                                className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value={0}>-- Select --</option>
                                {paymentModes.map((pm) => (
                                  <option key={pm.id} value={pm.id}>
                                    {pm.description}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <Input
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
                                className="text-right"
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <Input
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
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  setPaymentRows((prev) =>
                                    prev.filter((row) => row.tempId !== pr.tempId)
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Received Amount (computed from payment rows) */}
            <div>
              <Label>Received Amount</Label>
              <div
                className={`w-full border border-border rounded-lg px-4 py-2.5 text-right font-semibold text-lg bg-muted ${
                  receivedAmountRounded >= formNetAmount
                    ? ""
                    : "text-destructive"
                }`}
              >
                {receivedAmountRounded.toFixed(2)}
              </div>
            </div>

            {/* Re-Payment / Change Amount (display only) */}
            <div>
              <Label>Re-Payment Amount (Change)</Label>
              <div
                className={`w-full border border-border rounded-lg px-4 py-2.5 text-right font-semibold text-lg bg-muted ${
                  receivedAmountRounded >= formNetAmount
                    ? "text-green-700"
                    : "text-destructive"
                }`}
              >
                {(Math.round((receivedAmountRounded - formNetAmount) * 100) / 100).toFixed(2)}
              </div>
            </div>
          </div>

          {paymentError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2 mt-4">
              {paymentError}
            </p>
          )}

          <DialogFooter className="mt-6 flex items-center justify-between sm:justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Paper:</Label>
              <select
                value={paperWidth}
                onChange={(e) => {
                  const w = e.target.value as PaperWidth;
                  setPaperWidth(w);
                  setReceiptPaperWidth(w);
                }}
                className="h-8 border border-input rounded-md px-2 py-1 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPaymentModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveAndPrint}
                disabled={submitting || receivedAmountRounded < formNetAmount}
              >
                {submitting ? "Saving..." : "Save & Print"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-none w-full h-full max-h-full rounded-none border-none p-0 [&>button]:hidden">
          <div
            ref={modalRef}
            className="w-full h-full p-6 overflow-y-auto"
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
            <h3 className="text-lg font-bold mb-4">
              {editingTicket
                ? `Edit Ticket #${editingTicket.id}`
                : "New Ticket"}
            </h3>
            <form onSubmit={handleSubmit}>
              {/* Master section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {/* Route */}
                <div>
                  <Label className="mb-1 block">Route *</Label>
                  {isRouteRestricted || editingTicket ? (
                    <Input
                      type="text"
                      readOnly
                      value={
                        allRoutes.find((r) => r.id === formRouteId)
                          ? `${allRoutes.find((r) => r.id === formRouteId)!.branch_one_name} - ${allRoutes.find((r) => r.id === formRouteId)!.branch_two_name}`
                          : `Route #${formRouteId}`
                      }
                      tabIndex={-1}
                      className="bg-muted cursor-not-allowed"
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
                                  `/api/tickets/rate-lookup?item_id=${fi.item_id}&route_id=${newRouteId}${formBranchId ? `&branch_id=${formBranchId}` : ""}`
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
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                  <Label className="mb-1 block">Branch *</Label>
                  {isRouteRestricted || editingTicket ? (
                    <Input
                      type="text"
                      readOnly
                      value={
                        branches.find((b) => b.id === formBranchId)?.name ||
                        getSelectedBranchName() ||
                        `Branch #${formBranchId}`
                      }
                      tabIndex={-1}
                      className="bg-muted cursor-not-allowed"
                    />
                  ) : (
                    <select
                      required
                      value={formBranchId}
                      onChange={(e) => handleBranchChange(Number(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                  <Label className="mb-1 block">Ticket Date *</Label>
                  <Input
                    type="date"
                    required
                    readOnly={user?.role === "BILLING_OPERATOR"}
                    tabIndex={user?.role === "BILLING_OPERATOR" ? -1 : undefined}
                    value={formTicketDate}
                    onChange={(e) => setFormTicketDate(e.target.value)}
                    className={
                      user?.role === "BILLING_OPERATOR"
                        ? "bg-muted cursor-not-allowed"
                        : ""
                    }
                  />
                </div>

                {/* Departure */}
                <div>
                  <Label className="mb-1 block">Departure</Label>
                  <select
                    ref={departureRef}
                    value={formDeparture}
                    onChange={(e) => setFormDeparture(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                    <Label className="mb-1 block">Ticket No</Label>
                    <Input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={editingTicket.ticket_no}
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>
                )}
              </div>

              {/* Detail section - Ticket Items */}
              <div className="mb-4">
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-[70px]">
                          ID
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-[30%]">
                          Item
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-[100px]">
                          Rate
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-[100px]">
                          Levy
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-[70px]">
                          Qty
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-[140px]">
                          Vehicle No
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-[110px]">
                          Amount
                        </th>
                        <th className="text-center px-3 py-2 w-[100px]">
                          <Button
                            type="button"
                            size="sm"
                            tabIndex={-1}
                            onClick={handleAddItem}
                            disabled={formItems.some((fi) => isFormRowInvalid(fi, items))}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Item
                          </Button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="text-center py-4 text-muted-foreground"
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
                              className={`border-b border-border ${
                                fi.is_cancelled ? "opacity-40 bg-muted" : ""
                              }`}
                            >
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={1}
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
                                  className="h-8"
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
                                <Input
                                  tabIndex={-1}
                                  type="text"
                                  readOnly
                                  value={fi.rate.toFixed(2)}
                                  className="h-8 text-right bg-muted cursor-not-allowed"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  tabIndex={-1}
                                  type="text"
                                  readOnly
                                  value={fi.levy.toFixed(2)}
                                  className="h-8 text-right bg-muted cursor-not-allowed"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  id={`qty-${fi.tempId}`}
                                  type="number"
                                  min={1}
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
                                  className="h-8 text-right"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
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
                                  className="h-8"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  tabIndex={-1}
                                  type="text"
                                  readOnly
                                  value={rowAmount.toFixed(2)}
                                  className="h-8 text-right bg-muted cursor-not-allowed"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                {fi.is_cancelled ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    tabIndex={-1}
                                    onClick={() => handleRestoreItem(fi.tempId)}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    Restore
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    tabIndex={-1}
                                    onClick={() => handleCancelItem(fi.tempId)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    Cancel
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="border-t border-border">
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-right text-sm font-medium text-muted-foreground">
                          Amount
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={formAmount.toFixed(2)}
                            className="h-8 text-right bg-muted cursor-not-allowed"
                          />
                        </td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-right text-sm font-medium text-muted-foreground">
                          Discount
                        </td>
                        <td className="px-3 py-2">
                          <Input
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
                            className="h-8 text-right"
                          />
                        </td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-right text-sm font-semibold">
                          Net Amount
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={formNetAmount.toFixed(2)}
                            className="h-8 text-right font-semibold bg-muted cursor-not-allowed"
                          />
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2 mb-4">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-between pt-2">
                {/* Last ticket quick info */}
                {!editingTicket && lastTicketInfo ? (
                  <div className="flex items-center gap-5 px-3 py-2 text-sm text-muted-foreground border border-blue-200 rounded-lg bg-blue-50">
                    <span className="font-bold text-blue-700 uppercase tracking-wide">Last Ticket:</span>
                    <span>
                      Mode: <span className="font-bold text-foreground">{lastTicketInfo.paymentModes.join(", ")}</span>
                    </span>
                    <span>
                      Amt: <span className="font-bold text-foreground">{lastTicketInfo.amount.toFixed(2)}</span>
                    </span>
                    <span>
                      Change: <span className="font-bold text-foreground">{lastTicketInfo.repayment.toFixed(2)}</span>
                    </span>
                    {lastTicketInfo.refNo && (
                      <span>
                        Ref: <span className="font-bold text-foreground">{lastTicketInfo.refNo}</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <div />
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    tabIndex={-1}
                    onClick={closeModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    ref={submitRef}
                    type="submit"
                    tabIndex={-1}
                    disabled={submitting || formItems.some((fi) => isFormRowInvalid(fi, items))}
                  >
                  {submitting
                    ? "Saving..."
                    : editingTicket
                      ? "Update Ticket"
                      : "Create Ticket"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
