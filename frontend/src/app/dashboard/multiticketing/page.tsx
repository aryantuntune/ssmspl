"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";
import {
  MultiTicketInit,
  MultiTicketInitItem,
  TicketCreate,
  TicketItemCreate,
  Ticket,
  Route,
  Branch,
  TicketingStatus,
} from "@/types";
import {
  printReceipt,
  ReceiptData,
  getReceiptPaperWidth,
} from "@/lib/print-receipt";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, X, Trash2, RefreshCw, Lock, Printer, Ban, Pencil } from "lucide-react";
import DataTable, { Column } from "@/components/dashboard/DataTable";

/* ── Local grid types ── */

interface TicketGridItem {
  tempId: string;
  itemId: number;
  rate: number;
  levy: number;
  qty: number;
  vehicleNo: string;
  isSfItem?: boolean;
}

interface TicketGrid {
  tempId: string;
  paymentModeId: number;
  refNo: string;
  items: TicketGridItem[];
}

/* ── Helpers ── */

let _nextId = 1;
function uid(): string {
  return `_${_nextId++}_${Date.now()}`;
}

function emptyItem(): TicketGridItem {
  return { tempId: uid(), itemId: 0, rate: 0, levy: 0, qty: 0, vehicleNo: "" };
}

function sfItem(itemId: number, rate: number, levy: number): TicketGridItem {
  return { tempId: uid(), itemId, rate, levy, qty: 1, vehicleNo: "", isSfItem: true };
}

function emptyTicket(): TicketGrid {
  return { tempId: uid(), paymentModeId: 0, refNo: "", items: [emptyItem()] };
}

function emptyTicketWithSf(sfItemId: number, sfRate: number, sfLevy: number): TicketGrid {
  return { tempId: uid(), paymentModeId: 0, refNo: "", items: [sfItem(sfItemId, sfRate, sfLevy), emptyItem()] };
}

/**
 * Recalculate SF rate/levy split across all tickets.
 * Each ticket gets floor(total / count), last ticket gets the remainder.
 */
function recalcSfSplit(
  tickets: TicketGrid[],
  totalRate: number,
  totalLevy: number
): TicketGrid[] {
  const count = tickets.length;
  if (count === 0) return tickets;

  const baseRate = Math.floor(totalRate / count);
  const baseLevy = Math.floor(totalLevy / count);
  const remainderRate = totalRate - baseRate * count;
  const remainderLevy = totalLevy - baseLevy * count;

  return tickets.map((t, idx) => {
    const isLast = idx === count - 1;
    return {
      ...t,
      items: t.items.map((it) => {
        if (!it.isSfItem) return it;
        return {
          ...it,
          rate: isLast ? baseRate + remainderRate : baseRate,
          levy: isLast ? baseLevy + remainderLevy : baseLevy,
        };
      }),
    };
  });
}

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateYYYYMMDD(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour12: false });
}

function rowAmount(item: TicketGridItem): number {
  return Math.round((item.rate + item.levy) * item.qty * 100) / 100;
}

function ticketTotal(ticket: TicketGrid): number {
  return ticket.items.reduce((sum, it) => sum + rowAmount(it), 0);
}

function grandTotal(tickets: TicketGrid[]): number {
  return tickets.reduce((sum, t) => sum + ticketTotal(t), 0);
}

function isRowInvalid(
  item: TicketGridItem,
  itemLookup: (id: number) => MultiTicketInitItem | null
): boolean {
  if (item.isSfItem) return false;
  const def = itemLookup(item.itemId);
  if (!def || item.qty < 1) return true;
  return false;
}

/* ── Page Component ── */

export default function MultiTicketingPage() {
  const router = useRouter();
  const user = useDashboardUser();
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const needsRouteSelector = isAdmin && !user.route_id;

  // Admin route selector state
  const [allRoutes, setAllRoutes] = useState<Route[]>([]);
  const [adminRouteId, setAdminRouteId] = useState<number | null>(null);

  // Time-lock state (non-admin only)
  const [lockStatus, setLockStatus] = useState<TicketingStatus | null>(null);

  // Init data from backend
  const [initData, setInitData] = useState<MultiTicketInit | null>(null);
  const [initError, setInitError] = useState("");

  // Branch switcher
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [routeInfo, setRouteInfo] = useState<Route | null>(null);

  // Ticket grids
  const [tickets, setTickets] = useState<TicketGrid[]>([emptyTicket()]);

  // Live clock
  const [now, setNow] = useState(new Date());

  // Save state
  const [submitting, setSubmitting] = useState(false);

  // Multi-ticket listing state
  const [listTickets, setListTickets] = useState<Ticket[]>([]);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);
  const [listTotal, setListTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listSortBy, setListSortBy] = useState("id");
  const [listSortOrder, setListSortOrder] = useState<"asc" | "desc">("desc");
  const [listDateFrom, setListDateFrom] = useState(() => formatDateYYYYMMDD(new Date()));
  const [listDateTo, setListDateTo] = useState(() => formatDateYYYYMMDD(new Date()));
  const [listDateMode, setListDateMode] = useState<"single" | "range">(() => {
    if (typeof window === "undefined") return "single";
    const saved = localStorage.getItem("ssmspl_multiticketing_date_mode");
    return saved === "range" ? "range" : "single";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ssmspl_multiticketing_date_mode", listDateMode);
    }
    if (listDateMode === "single") {
      setListDateTo(listDateFrom);
    }
  }, [listDateMode, listDateFrom]);

  // Print/save refs
  const saveRef = useRef<HTMLButtonElement>(null);
  // Synchronous guard to prevent double-submission (rapid Alt+S / button double-click)
  const isSubmittingRef = useRef(false);

  /* ── Live clock ── */
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* ── Fetch all routes for admin selector ── */
  useEffect(() => {
    if (!needsRouteSelector) return;
    api.get<Route[]>("/api/routes").then(({ data }) => {
      setAllRoutes(data);
    }).catch(() => { /* ignore */ });
  }, [needsRouteSelector]);

  /* ── Time-lock polling (non-admin) ── */
  useEffect(() => {
    if (isAdmin) return;
    if (!initData?.branch_id) return;

    let cancelled = false;
    const check = async () => {
      try {
        const statusParams = new URLSearchParams({ branch_id: String(initData.branch_id) });
        if (initData.route_id) statusParams.set("route_id", String(initData.route_id));
        const { data } = await api.get<TicketingStatus>(
          `/api/tickets/ticketing-status?${statusParams}`
        );
        if (!cancelled) setLockStatus(data);
      } catch { /* ignore */ }
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAdmin, initData?.branch_id]);

  /* ── Fetch init data ── */
  const fetchInit = useCallback(async (branchId?: number | null, routeIdOverride?: number | null) => {
    try {
      const params = new URLSearchParams();
      if (branchId) params.set("branch_id", String(branchId));
      if (routeIdOverride) params.set("route_id", String(routeIdOverride));
      const qs = params.toString();
      const { data } = await api.get<MultiTicketInit>(`/api/tickets/multi-ticket-init${qs ? `?${qs}` : ""}`);
      setInitData(data);
      setInitError("");
      // Initialize tickets with SF item if configured
      if (data.sf_item_id && data.sf_rate != null && data.sf_levy != null) {
        setTickets([emptyTicketWithSf(data.sf_item_id, data.sf_rate, data.sf_levy)]);
      } else {
        setTickets([emptyTicket()]);
      }
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setInitError(detail || "Failed to load ticketing configuration. Please try again.");
    }
  }, []);

  /* ── Load init data on mount (skip if admin needs route selector first) ── */
  useEffect(() => {
    if (needsRouteSelector && !adminRouteId) return;
    fetchInit(undefined, adminRouteId);
  }, [fetchInit, needsRouteSelector, adminRouteId]);

  /* ── Fetch multi-ticket listing (filtered by current operating branch) ── */
  const fetchMultiTickets = useCallback(async () => {
    if (!initData?.branch_id) return;
    setListLoading(true);
    try {
      const skip = (listPage - 1) * listPageSize;
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(listPageSize),
        sort_by: listSortBy,
        sort_order: listSortOrder,
        is_multi_ticket: "true",
        date_from: listDateFrom,
        date_to: listDateTo,
        branch_filter: String(initData.branch_id),
      });
      const countParams = new URLSearchParams({
        is_multi_ticket: "true",
        date_from: listDateFrom,
        date_to: listDateTo,
        branch_filter: String(initData.branch_id),
      });
      const [pageResp, countResp] = await Promise.all([
        api.get<Ticket[]>(`/api/tickets?${params}`),
        api.get<number>(`/api/tickets/count?${countParams}`),
      ]);
      setListTickets(pageResp.data);
      setListTotal(countResp.data as unknown as number);
    } catch {
      /* ignore — listing is supplementary */
    } finally {
      setListLoading(false);
    }
  }, [listPage, listPageSize, listSortBy, listSortOrder, listDateFrom, listDateTo, initData?.branch_id]);

  useEffect(() => {
    fetchMultiTickets();
  }, [fetchMultiTickets]);

  /* ── Fetch route info for branch switcher ── */
  useEffect(() => {
    if (!initData?.route_id) return;
    api.get<Route>(`/api/routes/${initData.route_id}`).then(({ data }) => {
      setRouteInfo(data);
    }).catch(() => { /* ignore */ });
  }, [initData?.route_id]);

  /* ── Fetch branch info for receipt printing ── */
  const [branchInfo, setBranchInfo] = useState<Branch | null>(null);
  useEffect(() => {
    if (!initData?.branch_id) return;
    api.get<Branch>(`/api/branches/${initData.branch_id}`).then(({ data }) => {
      setBranchInfo(data);
    }).catch(() => { /* ignore */ });
  }, [initData?.branch_id]);


  /* ── Cancel ticket (SUPER_ADMIN only) ── */
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const handleCancelTicket = async (ticket: Ticket) => {
    if (cancellingId !== null) return;
    if (!confirm(`Cancel ticket #${ticket.ticket_no}? This cannot be undone.`)) return;
    setCancellingId(ticket.id);
    try {
      await api.patch(`/api/tickets/${ticket.id}`, { is_cancelled: true });
      fetchMultiTickets();
    } catch {
      alert("Failed to cancel ticket.");
    } finally {
      setCancellingId(null);
    }
  };

  /* ── Reprint ticket ── */
  const [reprintingId, setReprintingId] = useState<number | null>(null);
  const handleReprintTicket = async (ticket: Ticket) => {
    if (reprintingId !== null) return;
    setReprintingId(ticket.id);
    try {
      const res = await api.get<Ticket>(`/api/tickets/${ticket.id}`);
      const t = res.data;
      const paperWidth = getReceiptPaperWidth();

      // Use ticket's own branch info (may differ from page branch after edit)
      let ticketBranchName = t.branch_name || "";
      let ticketBranchPhone = "";
      if (t.branch_id === initData?.branch_id && branchInfo) {
        ticketBranchName = branchInfo.name;
        ticketBranchPhone = branchInfo.contact_nos || "";
      } else {
        try {
          const branchRes = await api.get<Branch>(`/api/branches/${t.branch_id}`);
          ticketBranchName = branchRes.data.name;
          ticketBranchPhone = branchRes.data.contact_nos || "";
        } catch { /* use ticket data */ }
      }

      // Determine from-to direction using route info
      let fromTo = "";
      if (t.route_id === routeInfo?.id && routeInfo) {
        const isFromBranchOne = t.branch_id === routeInfo.branch_id_one;
        fromTo = isFromBranchOne
          ? `${routeInfo.branch_one_name} To ${routeInfo.branch_two_name}`
          : `${routeInfo.branch_two_name} To ${routeInfo.branch_one_name}`;
      } else {
        fromTo = t.route_name || "";
      }

      const receiptData: ReceiptData = {
        ticketId: t.id,
        ticketNo: t.ticket_no,
        branchName: ticketBranchName,
        branchPhone: ticketBranchPhone,
        fromTo,
        ticketDate: t.ticket_date,
        createdAt: t.created_at || null,
        departure: t.departure || null,
        items: (t.items || [])
          .filter((ti) => !ti.is_cancelled)
          .map((ti) => ({
            name: ti.item_short_name || ti.item_name || `Item #${ti.item_id}`,
            quantity: ti.quantity,
            rate: ti.rate,
            levy: ti.levy,
            amount: ti.amount,
            vehicleNo: ti.vehicle_no || null,
          })),
        netAmount: t.net_amount,
        createdBy: t.created_by_username || user?.username || "",
        paperWidth,
        paymentModeName: t.payment_mode_name || "-",
      };
      await printReceipt(receiptData);
    } catch {
      alert("Failed to load ticket for reprinting.");
    } finally {
      setReprintingId(null);
    }
  };

  /* ── Edit ticket (SUPER_ADMIN only) ── */
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editBranchId, setEditBranchId] = useState<number>(0);
  const [editRouteId, setEditRouteId] = useState<number>(0);
  const [editTicketDate, setEditTicketDate] = useState<string>("");
  const [editRoutes, setEditRoutes] = useState<Route[]>([]);
  const [editBranches, setEditBranches] = useState<Branch[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const openEditDialog = async (ticket: Ticket) => {
    setEditingTicket(ticket);
    setEditBranchId(ticket.branch_id);
    setEditRouteId(ticket.route_id);
    setEditTicketDate(ticket.ticket_date);
    try {
      const [routesRes, branchesRes] = await Promise.all([
        api.get<Route[]>("/api/routes?limit=200"),
        api.get<Branch[]>("/api/branches?limit=200"),
      ]);
      setEditRoutes(routesRes.data);
      setEditBranches(branchesRes.data);
    } catch { /* ignore */ }
  };

  const handleEditSave = async () => {
    if (!editingTicket) return;
    const payload: Record<string, number | string | undefined> = {};
    if (editBranchId !== editingTicket.branch_id) payload.branch_id = editBranchId;
    if (editRouteId !== editingTicket.route_id) payload.route_id = editRouteId;
    if (editTicketDate && editTicketDate !== editingTicket.ticket_date) payload.ticket_date = editTicketDate;
    if (Object.keys(payload).length === 0) {
      setEditingTicket(null);
      return;
    }
    payload.version = editingTicket.version;
    setEditSubmitting(true);
    try {
      await api.patch(`/api/tickets/${editingTicket.id}`, payload);
      setEditingTicket(null);
      fetchMultiTickets();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to update ticket.";
      alert(msg);
    } finally {
      setEditSubmitting(false);
    }
  };

  /* ── Multi-ticket listing columns (dynamic — needs user role + handlers) ── */
  const canEdit = user.role === "SUPER_ADMIN";
  const canCancel = user.role === "SUPER_ADMIN";
  const canReprint = user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "MANAGER";
  const multiTicketColumns: Column<Ticket>[] = [
    { key: "id", label: "ID", sortable: true, className: "text-center" },
    { key: "ticket_no", label: "Ticket No", sortable: true, className: "text-center" },
    { key: "branch_name", label: "Branch", className: "text-center" },
    { key: "departure", label: "Departure", sortable: true, className: "text-center" },
    {
      key: "net_amount",
      label: "Net Amount",
      sortable: true,
      className: "text-center",
      render: (row) => `${Number(row.net_amount).toFixed(2)}`,
    },
    { key: "payment_mode_name", label: "Payment Mode", className: "text-center" },
    {
      key: "status",
      label: "Status",
      className: "text-center",
      render: (row) =>
        row.is_cancelled
          ? "\u274C Cancelled"
          : "\u2705 Confirmed",
    },
    {
      key: "created_at",
      label: "Created At",
      sortable: true,
      className: "text-center",
      render: (row) => {
        if (!row.created_at) return "\u2014";
        const d = new Date(row.created_at);
        return d.toLocaleTimeString("en-IN", { hour12: false });
      },
    },
    ...((canReprint || canCancel || canEdit) ? [{
      key: "actions",
      label: "Actions",
      className: "text-center whitespace-nowrap",
      render: (row: Ticket) => (
        <div className="flex justify-center items-center gap-1">
          {canEdit && !row.is_cancelled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEditDialog(row)}
              title="Edit branch / route"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canReprint && !row.is_cancelled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleReprintTicket(row)}
              disabled={reprintingId === row.id}
              title="Reprint"
            >
              <Printer className="h-4 w-4" />
            </Button>
          )}
          {canCancel && !row.is_cancelled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCancelTicket(row)}
              disabled={cancellingId === row.id}
              title="Cancel ticket"
              className="text-destructive hover:text-destructive"
            >
              <Ban className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    }] : []),
  ];

  /* ── Branch switch handler ── */
  const handleBranchSwitch = (branchId: number) => {
    setSelectedBranchId(branchId);
    fetchInit(branchId, adminRouteId);
  };

  /* ── Form reset ── */
  const resetForm = useCallback(() => {
    if (initData?.sf_item_id && initData.sf_rate != null && initData.sf_levy != null) {
      setTickets([emptyTicketWithSf(initData.sf_item_id, initData.sf_rate, initData.sf_levy)]);
    } else {
      setTickets([emptyTicket()]);
    }
  }, [initData]);


  /* ── Item helpers (lookup from initData) ── */
  const findItem = useCallback(
    (itemId: number) => {
      return initData?.items.find((i) => i.id === itemId) ?? null;
    },
    [initData]
  );

  /* ── Ticket CRUD ── */

  const hasSf = initData?.sf_item_id && initData.sf_rate != null && initData.sf_levy != null;

  const addTicket = () => {
    setTickets((prev) => {
      const newTicket = hasSf
        ? emptyTicketWithSf(initData!.sf_item_id!, initData!.sf_rate!, initData!.sf_levy!)
        : emptyTicket();
      const updated = [...prev, newTicket];
      return hasSf ? recalcSfSplit(updated, initData!.sf_rate!, initData!.sf_levy!) : updated;
    });
  };

  const removeTicket = (ticketTempId: string) => {
    setTickets((prev) => {
      const updated = prev.filter((t) => t.tempId !== ticketTempId);
      return hasSf ? recalcSfSplit(updated, initData!.sf_rate!, initData!.sf_levy!) : updated;
    });
  };

  const updateTicketPaymentMode = (ticketTempId: string, paymentModeId: number) => {
    setTickets((prev) =>
      prev.map((t) => (t.tempId === ticketTempId ? { ...t, paymentModeId, refNo: "" } : t))
    );
  };

  const updateTicketRefNo = (ticketTempId: string, refNo: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.tempId === ticketTempId ? { ...t, refNo } : t))
    );
  };

  /* ── Item CRUD within a ticket ── */

  const addItemRow = useCallback((ticketTempId: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.tempId === ticketTempId ? { ...t, items: [...t.items, emptyItem()] } : t
      )
    );
    // Auto-focus the ID input on the newly added row
    setTimeout(() => {
      const ticketCard = document.querySelector(`[data-ticket-id="${ticketTempId}"]`);
      if (ticketCard) {
        const inputs = ticketCard.querySelectorAll<HTMLInputElement>('[data-item-id-input]');
        const lastInput = inputs[inputs.length - 1];
        lastInput?.focus();
      }
    }, 50);
  }, []);

  const removeItemRow = useCallback((ticketTempId: string, itemTempId: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.tempId === ticketTempId
          ? { ...t, items: t.items.filter((i) => i.tempId !== itemTempId) }
          : t
      )
    );
  }, []);

  /* ── Keyboard shortcuts: Alt+A add row, Alt+D remove row ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;

      if (e.code === "KeyA") {
        e.preventDefault();
        e.stopPropagation();
        const ticketCard = (document.activeElement as HTMLElement)?.closest<HTMLElement>('[data-ticket-id]');
        const ticketTempId = ticketCard?.dataset.ticketId;
        if (!ticketTempId) return;
        const ticket = tickets.find((t) => t.tempId === ticketTempId);
        if (!ticket || ticket.items.some((it) => isRowInvalid(it, findItem))) return;
        addItemRow(ticketTempId);
      }

      if (e.code === "KeyS" && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        saveRef.current?.click();
      }

      if (e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        const row = (document.activeElement as HTMLElement)?.closest('tr');
        if (!row) return;
        const ticketCard = row.closest<HTMLElement>('[data-ticket-id]');
        const ticketTempId = ticketCard?.dataset.ticketId;
        if (!ticketTempId) return;
        const tbody = row.closest('tbody');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const rowIdx = rows.indexOf(row as HTMLTableRowElement);
        if (rowIdx === -1) return;
        const ticket = tickets.find((t) => t.tempId === ticketTempId);
        if (!ticket) return;
        const item = ticket.items[rowIdx];
        if (!item || item.isSfItem) return;
        removeItemRow(ticketTempId, item.tempId);
        setTimeout(() => {
          const updatedCard = document.querySelector<HTMLElement>(`[data-ticket-id="${ticketTempId}"]`);
          if (!updatedCard) return;
          const inputs = updatedCard.querySelectorAll<HTMLInputElement>('[data-item-id-input]');
          if (inputs.length === 0) return;
          const targetIdx = Math.min(rowIdx, inputs.length - 1);
          inputs[targetIdx]?.focus();
        }, 50);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [tickets, findItem, addItemRow, removeItemRow]);

  const updateItemField = (
    ticketTempId: string,
    itemTempId: string,
    field: keyof TicketGridItem,
    value: string | number
  ) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.tempId !== ticketTempId) return t;
        return {
          ...t,
          items: t.items.map((it) => {
            if (it.tempId !== itemTempId) return it;
            const updated = { ...it, [field]: value };

            // When item dropdown changes, auto-fill rate/levy and set qty to 1 if 0
            if (field === "itemId") {
              const found = findItem(value as number);
              if (found) {
                updated.rate = found.rate;
                updated.levy = found.levy;
                if (updated.qty === 0) updated.qty = 1;
              } else {
                updated.rate = 0;
                updated.levy = 0;
              }
              // Clear vehicle no when item changes
              updated.vehicleNo = "";
            }

            return updated;
          }),
        };
      })
    );
  };

  /* ── Validation ── */

  const validate = (): string | null => {
    if (!initData) return "Ticketing configuration not loaded.";
    if (!isAdmin && !initData.is_off_hours)
      return "Multi-ticketing is disabled during ferry operating hours. Please wait until the scheduled ferries are over.";
    if (tickets.length === 0) return "At least one ticket is required.";

    for (let ti = 0; ti < tickets.length; ti++) {
      const t = tickets[ti];
      const label = `Ticket #${ti + 1}`;

      if (!t.paymentModeId || t.paymentModeId <= 0)
        return `${label}: Please select a payment mode.`;


      const activeItems = t.items.filter((it) => it.qty > 0 && !it.isSfItem);
      if (activeItems.length === 0)
        return `${label}: At least one item (other than Special Ferry) with quantity > 0 is required.`;

      for (let ii = 0; ii < t.items.length; ii++) {
        const it = t.items[ii];
        if (it.qty > 0 && it.itemId <= 0)
          return `${label}, Row ${ii + 1}: Please select an item.`;

      }
    }

    return null;
  };

  /* ── Save & Print ── */

  const handleSaveAndPrint = async () => {
    // Synchronous guard: prevent duplicate batch creation from rapid presses
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const err = validate();
    if (err) {
      isSubmittingRef.current = false;
      alert(err);
      return;
    }

    if (!initData) { isSubmittingRef.current = false; return; }

    // Re-fetch fresh rates from server before submission to prevent stale-rate tickets
    let freshInit: MultiTicketInit;
    try {
      const freshParams = new URLSearchParams();
      if (selectedBranchId) freshParams.set("branch_id", String(selectedBranchId));
      if (adminRouteId) freshParams.set("route_id", String(adminRouteId));
      const freshQs = freshParams.toString();
      const { data } = await api.get<MultiTicketInit>(
        `/api/tickets/multi-ticket-init${freshQs ? `?${freshQs}` : ""}`
      );
      freshInit = data;
    } catch {
      isSubmittingRef.current = false;
      alert("Failed to verify current rates. Please refresh the page and try again.");
      return;
    }

    // Build a lookup of fresh rates
    const freshRateMap = new Map(freshInit.items.map((i) => [i.id, { rate: i.rate, levy: i.levy }]));

    // Check all ticket items against fresh rates and update if stale
    // SF items are checked separately: compare total SF rate/levy in fresh vs initData
    let hasStaleRates = false;
    const updatedTickets = tickets.map((t) => ({
      ...t,
      items: t.items.map((it) => {
        if (it.isSfItem || it.itemId <= 0) return it;
        const fresh = freshRateMap.get(it.itemId);
        if (!fresh) return it;
        if (Math.abs(it.rate - fresh.rate) > 0.01 || Math.abs(it.levy - fresh.levy) > 0.01) {
          hasStaleRates = true;
          return { ...it, rate: fresh.rate, levy: fresh.levy };
        }
        return it;
      }),
    }));

    // Check if SF rate itself has changed
    if (
      initData?.sf_item_id &&
      freshInit.sf_rate != null &&
      freshInit.sf_levy != null &&
      initData.sf_rate != null &&
      initData.sf_levy != null &&
      (Math.abs(freshInit.sf_rate - initData.sf_rate) > 0.01 ||
        Math.abs(freshInit.sf_levy - initData.sf_levy) > 0.01)
    ) {
      hasStaleRates = true;
    }

    if (hasStaleRates) {
      setTickets(
        hasSf && freshInit.sf_rate != null && freshInit.sf_levy != null
          ? recalcSfSplit(updatedTickets, freshInit.sf_rate, freshInit.sf_levy)
          : updatedTickets
      );
      // Update initData with full fresh response (items + SF rate/levy)
      setInitData(freshInit);
      isSubmittingRef.current = false;
      alert("Rates have been updated since you loaded this page. Amounts have been refreshed — please review and submit again.");
      return;
    }

    const nowSave = new Date();
    const today = formatDateYYYYMMDD(nowSave);
    // Use actual client time as departure — client always knows correct local time
    const currentTime = `${String(nowSave.getHours()).padStart(2, "0")}:${String(nowSave.getMinutes()).padStart(2, "0")}`;

    const payload: TicketCreate[] = tickets.map((t) => {
      const total = ticketTotal(t);
      const validItems: TicketItemCreate[] = t.items
        .filter((it) => it.qty > 0 && it.itemId > 0)
        .map((it) => ({
          item_id: it.itemId,
          rate: it.rate,
          levy: it.levy,
          quantity: it.qty,
          vehicle_no: it.vehicleNo.trim() || null,
        }));

      return {
        branch_id: initData.branch_id,
        ticket_date: today,
        departure: currentTime,
        route_id: initData.route_id,
        payment_mode_id: t.paymentModeId,
        ref_no: t.refNo.trim() || null,
        discount: 0,
        amount: total,
        net_amount: total,
        items: validItems,
      };
    });

    setSubmitting(true);
    try {
      const batchParams = new URLSearchParams();
      if (selectedBranchId) batchParams.set("branch_id", String(selectedBranchId));
      if (adminRouteId) batchParams.set("route_id", String(adminRouteId));
      const batchQs = batchParams.toString();
      const { data } = await api.post<Ticket[]>(`/api/tickets/batch${batchQs ? `?${batchQs}` : ""}`, {
        tickets: payload,
      });
      // Print each ticket using the same receipt format as normal ticketing
      const paperWidth = getReceiptPaperWidth();
      let fromTo = "";
      if (routeInfo) {
        const isFromBranchOne = initData.branch_id === routeInfo.branch_id_one;
        fromTo = isFromBranchOne
          ? `${routeInfo.branch_one_name} To ${routeInfo.branch_two_name}`
          : `${routeInfo.branch_two_name} To ${routeInfo.branch_one_name}`;
      }
      const branchName = branchInfo?.name || initData.branch_name || "";
      const branchPhone = branchInfo?.contact_nos || "";

      for (const ticket of data) {
        const receiptData: ReceiptData = {
          ticketId: ticket.id,
          ticketNo: ticket.ticket_no,
          branchName,
          branchPhone,
          fromTo,
          ticketDate: ticket.ticket_date,
          createdAt: ticket.created_at || null,
          departure: currentTime,
          items: (ticket.items || [])
            .filter((ti) => !ti.is_cancelled)
            .map((ti) => ({
              name: ti.item_short_name || initData.items.find((i) => i.id === ti.item_id)?.short_name || ti.item_name || `Item #${ti.item_id}`,
              quantity: ti.quantity,
              rate: ti.rate,
              levy: ti.levy,
              amount: ti.amount,
              vehicleNo: ti.vehicle_no || null,
            })),
          netAmount: ticket.net_amount,
          createdBy: ticket.created_by_username || user?.username || "",
          paperWidth,
          paymentModeName: ticket.payment_mode_name || "-",
        };
        await printReceipt(receiptData);
      }

      resetForm();
      fetchMultiTickets();
    } catch (e: unknown) {
      const errObj = e as { response?: { status?: number; data?: { detail?: string } } };
      const statusCode = errObj?.response?.status;
      const msg = errObj?.response?.data?.detail || "Failed to save tickets.";

      if (statusCode === 409) {
        // Server rejected due to rate mismatch — refresh init data
        fetchInit(selectedBranchId, adminRouteId);
        alert("Rates have changed. Page has been refreshed — please review and submit again.");
      } else {
        alert(msg);
      }
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  /* ── Loading / error states ── */

  // Lock screen for non-admin users
  const isLocked = !isAdmin && lockStatus && !lockStatus.multi_ticketing_open;

  /* ── Render ── */

  // Admin route selector (shown when admin has no assigned route)
  if (needsRouteSelector && !adminRouteId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-2xl font-bold mb-4">Multi-Ticketing</h1>
        <p className="text-muted-foreground mb-6 max-w-md">
          You don&apos;t have an assigned route. Please select a route to use multi-ticketing.
        </p>
        <select
          value=""
          onChange={(e) => {
            const id = Number(e.target.value);
            if (id) setAdminRouteId(id);
          }}
          className="border border-input rounded-lg px-4 py-2 text-sm bg-background text-foreground w-72"
        >
          <option value="">-- Select Route --</option>
          {allRoutes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.branch_one_name} - {r.branch_two_name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Route-level multi-ticketing disabled
  if (initData && !initData.multi_ticketing_enabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="rounded-full bg-muted p-6 mb-6">
          <Lock className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Multi-Ticketing Not Available</h1>
        <p className="text-muted-foreground max-w-md mb-4">
          Multi-ticketing is disabled for route <span className="font-semibold text-foreground">{initData.route_name}</span>.
          This route uses normal ticketing only. Contact a system administrator to enable it.
        </p>
      </div>
    );
  }

  // Lock screen for non-admin users when multi-ticketing is locked
  if (isLocked && lockStatus) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="rounded-full bg-muted p-6 mb-6">
          <Lock className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Multi-Ticketing is Locked</h1>
        <p className="text-muted-foreground max-w-md mb-4">
          Multi-ticketing is only available outside scheduled ferry hours.
          {lockStatus.multi_opens_at && (
            <> It will open at <span className="font-semibold text-foreground">{lockStatus.multi_opens_at}</span> (after the last ferry + 30 min buffer).</>
          )}
        </p>
        {lockStatus.first_ferry_time && lockStatus.last_ferry_time && (
          <p className="text-sm text-muted-foreground mb-2">
            Ferry schedule: {lockStatus.first_ferry_time} &ndash; {lockStatus.last_ferry_time}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Current server time: <span className="font-mono">{lockStatus.current_time}</span>
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          This page checks automatically every 30 seconds and will unlock when the time comes.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h1 className="text-2xl font-bold">Multi-Ticketing</h1>
          <div className="flex items-center gap-2">
            {needsRouteSelector && adminRouteId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAdminRouteId(null); setInitData(null); setInitError(""); }}
              >
                Change Route
              </Button>
            )}
            {initData && (
              <Button onClick={addTicket}>
                <Plus className="h-4 w-4 mr-2" /> Add Ticket
              </Button>
            )}
          </div>
        </div>

        {/* ── Error banner ── */}
        {initError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm mb-4">
            {initError}
            <Button variant="link" onClick={() => fetchInit(selectedBranchId, adminRouteId)} className="ml-2 h-auto p-0 text-sm">
              Retry
            </Button>
          </div>
        )}

        {initData && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* ── Header info bar ── */}
            <Card className="mb-6 shrink-0">
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                  <div>
                    <span className="text-foreground font-medium">Route:</span>{" "}
                    <span className="font-semibold text-foreground">{initData.route_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">Operating from:</span>{" "}
                    <span className="font-semibold text-foreground">{initData.branch_name}</span>
                    {routeInfo && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2 text-xs h-7"
                        onClick={() => {
                          const siblingId = initData.branch_id === routeInfo.branch_id_one
                            ? routeInfo.branch_id_two
                            : routeInfo.branch_id_one;
                          handleBranchSwitch(siblingId);
                        }}
                      >
                        Switch to{" "}
                        {initData.branch_id === routeInfo.branch_id_one
                          ? routeInfo.branch_two_name
                          : routeInfo.branch_one_name}
                      </Button>
                    )}
                  </div>
                  <div>
                    <span className="text-foreground font-medium">Date:</span>{" "}
                    <span className="font-semibold text-foreground">{formatDateDDMMYYYY(now)}</span>
                  </div>
                  <div>
                    <span className="text-foreground font-medium">Time:</span>{" "}
                    <span className="font-mono font-semibold text-foreground">{formatTime(now)}</span>
                  </div>
                  {initData.first_ferry_time && (
                    <div>
                      <span className="text-foreground font-medium">First Ferry:</span>{" "}
                      <span className="text-foreground">{initData.first_ferry_time}</span>
                    </div>
                  )}
                  {initData.last_ferry_time && (
                    <div>
                      <span className="text-foreground font-medium">Last Ferry:</span>{" "}
                      <span className="text-foreground">{initData.last_ferry_time}</span>
                    </div>
                  )}
                  <div>
                    {initData.is_off_hours ? (
                      <Badge variant="default">Off-Hours — Multi-Ticketing Active</Badge>
                    ) : isAdmin ? (
                      <Badge variant="secondary">Ferry Hours Active — Admin Override</Badge>
                    ) : (
                      <Badge variant="destructive">Ferry Hours Active — Multi-Ticketing Disabled</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Ticket grids ── */}
            <div className="space-y-6 flex-1 overflow-y-auto">
              {tickets.map((ticket, ticketIdx) => {
                const tTotal = ticketTotal(ticket);
                return (
                  <Card
                    key={ticket.tempId}
                    data-ticket-id={ticket.tempId}
                  >
                    <CardContent className="p-4">
                      {/* Card header */}
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-foreground">
                          Ticket #{ticketIdx + 1}
                        </h3>
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-foreground">Payment Mode:</label>
                          <select
                            value={ticket.paymentModeId}
                            onChange={(e) =>
                              updateTicketPaymentMode(ticket.tempId, Number(e.target.value))
                            }
                            className="border border-input rounded px-2 py-1 text-sm bg-background text-foreground"
                          >
                            <option value={0}>-- Select --</option>
                            {initData.payment_modes.map((pm) => (
                              <option key={pm.id} value={pm.id}>
                                {pm.description}
                              </option>
                            ))}
                          </select>
                          {tickets.length > 1 && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => removeTicket(ticket.tempId)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove Ticket
                            </Button>
                          )}
                        </div>

                        {/* UPI Ref No (shown inline below the header row when UPI selected) */}
                        {initData.payment_modes.find((pm) => pm.id === ticket.paymentModeId)?.description.toUpperCase() === "UPI" && (
                          <div className="flex items-center gap-2 mt-2">
                            <label className="text-sm text-foreground whitespace-nowrap">UPI Ref No:</label>
                            <input
                              type="text"
                              placeholder="Transaction / Reference ID (optional)"
                              value={ticket.refNo}
                              onChange={(e) => updateTicketRefNo(ticket.tempId, e.target.value)}
                              className="border border-input rounded px-2 py-1 text-sm bg-background text-foreground flex-1"
                            />
                          </div>
                        )}
                      </div>

                      {/* Items table */}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[70px]">ID</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Rate</TableHead>
                            <TableHead>Levy</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead>Vehicle No</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-center w-16">
                              {(() => {
                                const hasInvalidRow = ticket.items.some(
                                  (it) => isRowInvalid(it, findItem)
                                );
                                return (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="default"
                                    tabIndex={-1}
                                    onClick={() => addItemRow(ticket.tempId)}
                                    disabled={hasInvalidRow}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                );
                              })()}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ticket.items.map((item) => {
                            const itemDef = findItem(item.itemId);
                            const isVehicle = itemDef?.is_vehicle ?? false;
                            const amt = rowAmount(item);
                            const locked = !!item.isSfItem;

                            const hasValidItem = item.itemId > 0 && !!itemDef;

                            return (
                              <TableRow key={item.tempId} className={locked ? "bg-amber-50 hover:bg-amber-50/80" : ""}>
                                {/* ID column */}
                                <TableCell className="px-3 py-2">
                                  {locked ? (
                                    <span className="text-xs text-amber-700 font-mono">{item.itemId}</span>
                                  ) : (
                                    <input
                                      type="number"
                                      min={1}
                                      value={item.itemId || ""}
                                      placeholder="ID"
                                      data-item-id-input
                                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                                      onChange={(e) => {
                                        const id = parseInt(e.target.value) || 0;
                                        if (hasSf && id === initData?.sf_item_id) return;
                                        updateItemField(
                                          ticket.tempId,
                                          item.tempId,
                                          "itemId",
                                          id
                                        );
                                      }}
                                      className="border border-input rounded px-2 py-1 text-sm w-full bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  )}
                                </TableCell>
                                {/* Item dropdown */}
                                <TableCell className="px-3 py-2">
                                  {locked ? (
                                    <span className="font-semibold text-sm text-amber-800">
                                      {itemDef?.name ?? "SPECIAL FERRY"}
                                    </span>
                                  ) : (
                                    <select
                                      tabIndex={hasValidItem ? -1 : 0}
                                      value={item.itemId}
                                      onChange={(e) =>
                                        updateItemField(
                                          ticket.tempId,
                                          item.tempId,
                                          "itemId",
                                          Number(e.target.value)
                                        )
                                      }
                                      className="border border-input rounded px-2 py-1 text-sm w-full min-w-0 sm:min-w-[160px] bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                      <option value={0}>-- Select Item --</option>
                                      {initData.items
                                        .filter((it) => !hasSf || it.id !== initData.sf_item_id)
                                        .map((it) => (
                                        <option key={it.id} value={it.id}>
                                          {it.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-foreground">
                                  {item.rate.toFixed(2)}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-foreground">
                                  {item.levy.toFixed(2)}
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                  {locked ? (
                                    <span className="text-sm font-medium">{item.qty}</span>
                                  ) : (
                                    <input
                                      type="number"
                                      min={0}
                                      value={item.qty}
                                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                                      onChange={(e) =>
                                        updateItemField(
                                          ticket.tempId,
                                          item.tempId,
                                          "qty",
                                          Math.max(0, parseInt(e.target.value) || 0)
                                        )
                                      }
                                      className="border border-input rounded px-2 py-1 text-sm w-20 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                  {locked ? (
                                    <span className="text-muted-foreground text-xs">N/A</span>
                                  ) : isVehicle ? (
                                    <input
                                      type="text"
                                      value={item.vehicleNo}
                                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                                      onChange={(e) =>
                                        updateItemField(
                                          ticket.tempId,
                                          item.tempId,
                                          "vehicleNo",
                                          e.target.value
                                        )
                                      }
                                      placeholder="Vehicle No (optional)"
                                      className="border border-input rounded px-2 py-1 text-sm w-full min-w-0 sm:min-w-[120px] bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  ) : (
                                    <span className="text-muted-foreground text-xs">N/A</span>
                                  )}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-right font-medium text-foreground">
                                  {amt.toFixed(2)}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-center">
                                  {!locked && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      tabIndex={-1}
                                      onClick={() =>
                                        removeItemRow(ticket.tempId, item.tempId)
                                      }
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>

                      {/* Card footer */}
                      <div className="flex items-center justify-end mt-3 pt-3 border-t">
                        <div className="text-lg font-bold text-foreground">
                          Ticket Total: <span className="text-primary">{tTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* ── Grand total ── */}
              <Card className="mt-6">
                <CardContent className="py-4 flex items-center justify-between">
                  <span className="text-xl font-bold text-foreground">Grand Total:</span>
                  <span className="text-2xl font-bold text-primary">
                    {grandTotal(tickets).toFixed(2)}
                  </span>
                </CardContent>
              </Card>

              {/* ── Footer buttons ── */}
              <div className="mt-6 flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  Cancel
                </Button>
                <Button
                  ref={saveRef}
                  onClick={handleSaveAndPrint}
                  disabled={submitting || tickets.some((t) => {
                    if (!t.paymentModeId) return true;
                    return t.items.some((it) => isRowInvalid(it, findItem));
                  })}
                >
                  {submitting ? "Saving..." : "Save & Print"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Multi-Tickets listing ── */}
        <div className="mt-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold">Multi-Tickets</h2>
            <div className="flex flex-wrap items-end gap-3">
              {(user.role === "SUPER_ADMIN" || user.role === "ADMIN") && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Date Mode</Label>
                    <div className="inline-flex rounded-md border border-input bg-background h-10 p-0.5">
                      <button
                        type="button"
                        onClick={() => { setListDateMode("single"); setListPage(1); }}
                        className={`px-3 text-xs font-medium rounded-sm transition-colors ${
                          listDateMode === "single"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Single
                      </button>
                      <button
                        type="button"
                        onClick={() => { setListDateMode("range"); setListPage(1); }}
                        className={`px-3 text-xs font-medium rounded-sm transition-colors ${
                          listDateMode === "range"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Range
                      </button>
                    </div>
                  </div>
                  {listDateMode === "single" ? (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
                      <Input
                        type="date"
                        value={listDateFrom}
                        onChange={(e) => {
                          const val = e.target.value;
                          setListDateFrom(val);
                          setListDateTo(val);
                          setListPage(1);
                        }}
                        className="w-[150px]"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Date From</Label>
                        <Input
                          type="date"
                          value={listDateFrom}
                          onChange={(e) => { setListDateFrom(e.target.value); setListPage(1); }}
                          className="w-[150px]"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Date To</Label>
                        <Input
                          type="date"
                          value={listDateTo}
                          onChange={(e) => { setListDateTo(e.target.value); setListPage(1); }}
                          className="w-[150px]"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
              <Button variant="outline" size="sm" onClick={fetchMultiTickets} disabled={listLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${listLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
          <DataTable<Ticket>
            columns={multiTicketColumns}
            data={listTickets}
            totalCount={listTotal}
            page={listPage}
            pageSize={listPageSize}
            sortBy={listSortBy}
            sortOrder={listSortOrder}
            onPageChange={setListPage}
            onPageSizeChange={(size) => { setListPageSize(size); setListPage(1); }}
            onSort={(col) => {
              if (col === listSortBy) {
                setListSortOrder(listSortOrder === "asc" ? "desc" : "asc");
              } else {
                setListSortBy(col);
                setListSortOrder("desc");
              }
            }}
            loading={listLoading}
            emptyMessage="No multi-tickets found for the selected date range."
            rowClassName={(row) => row.is_cancelled ? "opacity-50" : undefined}
          />
        </div>
      </div>
      {/* ── Edit ticket dialog (SUPER_ADMIN only) ── */}
      <Dialog open={editingTicket !== null} onOpenChange={(open) => { if (!open) setEditingTicket(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Ticket #{editingTicket?.ticket_no}</DialogTitle>
          </DialogHeader>
          {editingTicket && (
            <div className="space-y-4">
              <div>
                <Label>Ticket Date</Label>
                <Input
                  type="date"
                  value={editTicketDate}
                  onChange={(e) => setEditTicketDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Branch (Operating From)</Label>
                <select
                  value={editBranchId}
                  onChange={(e) => setEditBranchId(Number(e.target.value))}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground mt-1"
                >
                  <option value={0}>-- Select Branch --</option>
                  {editBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Route</Label>
                <select
                  value={editRouteId}
                  onChange={(e) => setEditRouteId(Number(e.target.value))}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground mt-1"
                >
                  <option value={0}>-- Select Route --</option>
                  {editRoutes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.branch_one_name} - {r.branch_two_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTicket(null)} disabled={editSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSubmitting || !editBranchId || !editRouteId || !editTicketDate}>
              {editSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
