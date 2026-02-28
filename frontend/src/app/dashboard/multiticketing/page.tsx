"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  MultiTicketInit,
  MultiTicketInitItem,
  TicketCreate,
  TicketItemCreate,
  TicketPayementCreate,
  Ticket,
  Route,
} from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, X, Trash2 } from "lucide-react";

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
  return { tempId: uid(), paymentModeId: 0, items: [emptyItem()] };
}

function emptyTicketWithSf(sfItemId: number, sfRate: number, sfLevy: number): TicketGrid {
  return { tempId: uid(), paymentModeId: 0, items: [sfItem(sfItemId, sfRate, sfLevy), emptyItem()] };
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
  if (def.is_vehicle && !item.vehicleNo.trim()) return true;
  return false;
}

/* ── Page Component ── */

export default function MultiTicketingPage() {
  const router = useRouter();

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

  // Print state
  const [printData, setPrintData] = useState<Ticket[] | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const printTriggered = useRef(false);
  const saveRef = useRef<HTMLButtonElement>(null);

  /* ── Live clock ── */
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* ── Fetch init data ── */
  const fetchInit = useCallback(async (branchId?: number | null) => {
    try {
      const branchParam = branchId ? `?branch_id=${branchId}` : "";
      const { data } = await api.get<MultiTicketInit>(`/api/tickets/multi-ticket-init${branchParam}`);
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

  /* ── Load init data on mount ── */
  useEffect(() => {
    fetchInit();
  }, [fetchInit]);

  /* ── Fetch route info for branch switcher ── */
  useEffect(() => {
    if (!initData?.route_id) return;
    api.get<Route>(`/api/routes/${initData.route_id}`).then(({ data }) => {
      setRouteInfo(data);
    }).catch(() => { /* ignore */ });
  }, [initData?.route_id]);

  /* ── Branch switch handler ── */
  const handleBranchSwitch = (branchId: number) => {
    setSelectedBranchId(branchId);
    fetchInit(branchId);
  };

  /* ── Form reset ── */
  const resetForm = useCallback(() => {
    if (initData?.sf_item_id && initData.sf_rate != null && initData.sf_levy != null) {
      setTickets([emptyTicketWithSf(initData.sf_item_id, initData.sf_rate, initData.sf_levy)]);
    } else {
      setTickets([emptyTicket()]);
    }
  }, [initData]);

  /* ── Print trigger ── */
  useEffect(() => {
    if (showPrint && printData && !printTriggered.current) {
      printTriggered.current = true;
      const timeout = setTimeout(() => {
        window.print();
        // After print dialog closes, reset form
        setPrintData(null);
        setShowPrint(false);
        printTriggered.current = false;
        resetForm();
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [showPrint, printData, resetForm]);

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
      prev.map((t) => (t.tempId === ticketTempId ? { ...t, paymentModeId } : t))
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

      if (e.code === "KeyS") {
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
    if (!initData.is_off_hours)
      return "Ticketing is disabled during ferry operating hours. Multi-ticketing is only available during off-hours.";
    if (tickets.length === 0) return "At least one ticket is required.";

    for (let ti = 0; ti < tickets.length; ti++) {
      const t = tickets[ti];
      const label = `Ticket #${ti + 1}`;

      if (!t.paymentModeId || t.paymentModeId <= 0)
        return `${label}: Please select a payment mode.`;

      const activeItems = t.items.filter((it) => it.qty > 0);
      if (activeItems.length === 0)
        return `${label}: At least one item with quantity > 0 is required.`;

      for (let ii = 0; ii < t.items.length; ii++) {
        const it = t.items[ii];
        if (it.qty > 0 && it.itemId <= 0)
          return `${label}, Row ${ii + 1}: Please select an item.`;

        if (it.qty > 0 && it.itemId > 0) {
          const itemDef = findItem(it.itemId);
          if (itemDef?.is_vehicle && !it.vehicleNo.trim())
            return `${label}, Row ${ii + 1}: Vehicle number is required for "${itemDef.name}".`;
        }
      }
    }

    return null;
  };

  /* ── Save & Print ── */

  const handleSaveAndPrint = async () => {
    const err = validate();
    if (err) {
      alert(err);
      return;
    }

    if (!initData) return;

    const today = formatDateYYYYMMDD(new Date());

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

      const payments: TicketPayementCreate[] = [
        { payment_mode_id: t.paymentModeId, amount: total },
      ];

      return {
        branch_id: initData.branch_id,
        ticket_date: today,
        departure: null,
        route_id: initData.route_id,
        payment_mode_id: t.paymentModeId,
        discount: 0,
        amount: total,
        net_amount: total,
        items: validItems,
        payments,
      };
    });

    setSubmitting(true);
    try {
      const branchParam = selectedBranchId ? `?branch_id=${selectedBranchId}` : "";
      const { data } = await api.post<Ticket[]>(`/api/tickets/batch${branchParam}`, {
        tickets: payload,
      });
      setPrintData(data);
      setShowPrint(true);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
            "Failed to save tickets."
          : "Failed to save tickets.";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Loading / error states ── */

  /* ── Render ── */

  return (
    <>
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h1 className="text-2xl font-bold">Multi-Ticketing</h1>
          {initData && (
            <Button onClick={addTicket}>
              <Plus className="h-4 w-4 mr-2" /> Add Ticket
            </Button>
          )}
        </div>

        {/* ── Error banner ── */}
        {initError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm mb-4">
            {initError}
            <Button variant="link" onClick={() => fetchInit(selectedBranchId)} className="ml-2 h-auto p-0 text-sm">
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
                      <Badge variant="default">Off-Hours Active</Badge>
                    ) : (
                      <Badge variant="destructive">Ferry Hours Active - Ticketing Disabled</Badge>
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
                                      {initData.items.map((it) => (
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
                                      placeholder="Vehicle No"
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
                  disabled={submitting || tickets.some((t) => !t.paymentModeId || t.items.some((it) => isRowInvalid(it, findItem)))}
                >
                  {submitting ? "Saving..." : "Save & Print"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Print View ── */}
      {showPrint && printData && (
        <div className="hidden print:block p-4">
          {printData.map((ticket, idx) => (
            <div key={ticket.id} className="mb-8">
              {idx > 0 && <hr className="border-t-2 border-dashed border-gray-400 my-6" />}
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold">SSMSPL - Ferry Ticket</h2>
              </div>
              <div className="text-sm space-y-1 mb-3">
                <p>
                  <strong>Ticket No:</strong> {ticket.ticket_no}
                </p>
                <p>
                  <strong>Branch:</strong> {ticket.branch_name}
                  &nbsp;&nbsp;&nbsp;
                  <strong>Route:</strong> {ticket.route_name}
                </p>
                <p>
                  <strong>Date:</strong> {ticket.ticket_date}
                </p>
              </div>
              <table className="w-full text-sm border-collapse mb-3">
                <thead>
                  <tr className="border-b-2 border-gray-800">
                    <th className="text-left py-1 px-2">Item</th>
                    <th className="text-center py-1 px-2">Qty</th>
                    <th className="text-right py-1 px-2">Rate</th>
                    <th className="text-right py-1 px-2">Levy</th>
                    <th className="text-right py-1 px-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ticket.items?.map((ti) => (
                    <tr key={ti.id} className="border-b border-gray-300">
                      <td className="py-1 px-2">{ti.item_name}</td>
                      <td className="py-1 px-2 text-center">{ti.quantity}</td>
                      <td className="py-1 px-2 text-right">{ti.rate.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right">{ti.levy.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right">{ti.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-sm font-bold border-t-2 border-gray-800 pt-2">
                <span>Total: {ticket.net_amount.toFixed(2)}</span>
                <span>Payment: {ticket.payment_mode_name}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
