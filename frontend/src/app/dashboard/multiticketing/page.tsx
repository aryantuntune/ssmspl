"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import {
  User,
  MultiTicketInit,
  MultiTicketInitItem,
  TicketCreate,
  TicketItemCreate,
  TicketPayementCreate,
  Ticket,
} from "@/types";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

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

  // Auth & loading
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Init data from backend
  const [initData, setInitData] = useState<MultiTicketInit | null>(null);
  const [initError, setInitError] = useState("");

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
  const fetchInit = useCallback(async () => {
    try {
      const { data } = await api.get<MultiTicketInit>("/api/tickets/multi-ticket-init");
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

  /* ── Auth guard + init ── */
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api
      .get<User>("/api/auth/me")
      .then(({ data }) => {
        setUser(data);
        return fetchInit();
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router, fetchInit]);

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

  const addItemRow = (ticketTempId: string) => {
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
  };

  const removeItemRow = (ticketTempId: string, itemTempId: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.tempId === ticketTempId
          ? { ...t, items: t.items.filter((i) => i.tempId !== itemTempId) }
          : t
      )
    );
  };

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
      const { data } = await api.post<Ticket[]>("/api/tickets/batch", {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-lg">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  /* ── Render ── */

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="print:hidden">
        <Navbar user={user} />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 p-6 bg-gray-50 print:hidden flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h1 className="text-2xl font-bold text-gray-800">Multi-Ticketing</h1>
            {initData && (
              <button
                onClick={addTicket}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                + Add Ticket
              </button>
            )}
          </div>

          {initError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {initError}
              <button
                onClick={fetchInit}
                className="ml-3 underline text-red-600 hover:text-red-800 text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {initData && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* ── Header info bar ── */}
              <div className="bg-white rounded-lg shadow p-4 mb-6 shrink-0">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                  <div>
                    <span className="text-black font-medium">Route:</span>{" "}
                    <span className="font-semibold text-gray-800">{initData.route_name}</span>
                  </div>
                  <div>
                    <span className="text-black font-medium">Branch:</span>{" "}
                    <span className="font-semibold text-gray-800">{initData.branch_name}</span>
                  </div>
                  <div>
                    <span className="text-black font-medium">Date:</span>{" "}
                    <span className="font-semibold text-gray-800">{formatDateDDMMYYYY(now)}</span>
                  </div>
                  <div>
                    <span className="text-black font-medium">Time:</span>{" "}
                    <span className="font-mono font-semibold text-gray-800">{formatTime(now)}</span>
                  </div>
                  {initData.first_ferry_time && (
                    <div>
                      <span className="text-black font-medium">First Ferry:</span>{" "}
                      <span className="text-gray-800">{initData.first_ferry_time}</span>
                    </div>
                  )}
                  {initData.last_ferry_time && (
                    <div>
                      <span className="text-black font-medium">Last Ferry:</span>{" "}
                      <span className="text-gray-800">{initData.last_ferry_time}</span>
                    </div>
                  )}
                  <div>
                    {initData.is_off_hours ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Off-Hours Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Ferry Hours Active - Ticketing Disabled
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Ticket grids ── */}
              <div className="space-y-6 flex-1 overflow-y-auto">
                {tickets.map((ticket, ticketIdx) => {
                  const tTotal = ticketTotal(ticket);
                  return (
                    <div
                      key={ticket.tempId}
                      data-ticket-id={ticket.tempId}
                      className="bg-white border border-gray-200 rounded-lg p-4"
                    >
                      {/* Card header */}
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-800">
                          Ticket #{ticketIdx + 1}
                        </h3>
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-black">Payment Mode:</label>
                          <select
                            value={ticket.paymentModeId}
                            onChange={(e) =>
                              updateTicketPaymentMode(ticket.tempId, Number(e.target.value))
                            }
                            className="border border-gray-300 rounded px-2 py-1 text-sm"
                          >
                            <option value={0}>-- Select --</option>
                            {initData.payment_modes.map((pm) => (
                              <option key={pm.id} value={pm.id}>
                                {pm.description}
                              </option>
                            ))}
                          </select>
                          {tickets.length > 1 && (
                            <button
                              onClick={() => removeTicket(ticket.tempId)}
                              className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded"
                            >
                              Remove Ticket
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Items table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="text-left px-3 py-2 w-[70px]">ID</th>
                              <th className="text-left px-3 py-2">Item</th>
                              <th className="text-left px-3 py-2">Rate</th>
                              <th className="text-left px-3 py-2">Levy</th>
                              <th className="text-left px-3 py-2">Qty</th>
                              <th className="text-left px-3 py-2">Vehicle No</th>
                              <th className="text-right px-3 py-2">Amount</th>
                              <th className="text-center px-3 py-2 w-16">
                                {(() => {
                                  const hasInvalidRow = ticket.items.some(
                                    (it) => isRowInvalid(it, findItem)
                                  );
                                  return (
                                    <button
                                      type="button"
                                      tabIndex={-1}
                                      onClick={() => addItemRow(ticket.tempId)}
                                      disabled={hasInvalidRow}
                                      className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      +
                                    </button>
                                  );
                                })()}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {ticket.items.map((item) => {
                              const itemDef = findItem(item.itemId);
                              const isVehicle = itemDef?.is_vehicle ?? false;
                              const amt = rowAmount(item);
                              const locked = !!item.isSfItem;

                              const hasValidItem = item.itemId > 0 && !!itemDef;

                              return (
                                <tr key={item.tempId} className={`border-t border-gray-200 ${locked ? "bg-amber-50" : ""}`}>
                                  {/* ID column */}
                                  <td className="px-3 py-2">
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
                                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    )}
                                  </td>
                                  {/* Item dropdown */}
                                  <td className="px-3 py-2">
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
                                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      >
                                        <option value={0}>-- Select Item --</option>
                                        {initData.items.map((it) => (
                                          <option key={it.id} value={it.id}>
                                            {it.name}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-black">
                                    {item.rate.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-black">
                                    {item.levy.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2">
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
                                        className="border border-gray-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    {locked ? (
                                      <span className="text-black text-xs">N/A</span>
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
                                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full min-w-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    ) : (
                                      <span className="text-black text-xs">N/A</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-800">
                                    {amt.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {!locked && (
                                      <button
                                        tabIndex={-1}
                                        onClick={() =>
                                          removeItemRow(ticket.tempId, item.tempId)
                                        }
                                        className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded"
                                      >
                                        X
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Card footer */}
                      <div className="flex items-center justify-end mt-3 pt-3 border-t border-gray-200">
                        <div className="text-lg font-bold text-gray-800">
                          Ticket Total: <span className="text-blue-700">{tTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ── Grand total ── */}
                <div className="mt-6 bg-white rounded-lg shadow p-4 flex items-center justify-between">
                  <span className="text-xl font-bold text-gray-800">Grand Total:</span>
                  <span className="text-2xl font-bold text-blue-700">
                    {grandTotal(tickets).toFixed(2)}
                  </span>
                </div>

                {/* ── Footer buttons ── */}
                <div className="mt-6 flex items-center gap-4">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    ref={saveRef}
                    onClick={handleSaveAndPrint}
                    disabled={submitting || tickets.some((t) => !t.paymentModeId || t.items.some((it) => isRowInvalid(it, findItem)))}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Saving..." : "Save & Print"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
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
    </div>
  );
}
