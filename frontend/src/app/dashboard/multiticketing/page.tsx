"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import {
  User,
  MultiTicketInit,
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

function emptyTicket(): TicketGrid {
  return { tempId: uid(), paymentModeId: 0, items: [emptyItem()] };
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
    } catch {
      setInitError("Failed to load ticketing configuration. Please try again.");
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
    setTickets([emptyTicket()]);
  }, []);

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

  const addTicket = () => {
    setTickets((prev) => [...prev, emptyTicket()]);
  };

  const removeTicket = (ticketTempId: string) => {
    setTickets((prev) => prev.filter((t) => t.tempId !== ticketTempId));
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
    <div className="min-h-screen flex flex-col">
      <div className="print:hidden">
        <Navbar user={user} />
      </div>
      <div className="flex flex-1">
        <div className="print:hidden">
          <Sidebar menuItems={user.menu_items} />
        </div>
        <main className="flex-1 p-6 bg-gray-50 print:hidden">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Multi-Ticketing</h1>

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
            <>
              {/* ── Header info bar ── */}
              <div className="bg-white rounded-lg shadow p-4 mb-6">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                  <div>
                    <span className="text-gray-500 font-medium">Route:</span>{" "}
                    <span className="font-semibold text-gray-800">{initData.route_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Branch:</span>{" "}
                    <span className="font-semibold text-gray-800">{initData.branch_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Date:</span>{" "}
                    <span className="font-semibold text-gray-800">{formatDateDDMMYYYY(now)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Time:</span>{" "}
                    <span className="font-mono font-semibold text-gray-800">{formatTime(now)}</span>
                  </div>
                  {initData.first_ferry_time && (
                    <div>
                      <span className="text-gray-500 font-medium">First Ferry:</span>{" "}
                      <span className="text-gray-800">{initData.first_ferry_time}</span>
                    </div>
                  )}
                  {initData.last_ferry_time && (
                    <div>
                      <span className="text-gray-500 font-medium">Last Ferry:</span>{" "}
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
              <div className="space-y-6">
                {tickets.map((ticket, ticketIdx) => {
                  const tTotal = ticketTotal(ticket);
                  return (
                    <div
                      key={ticket.tempId}
                      className="bg-white border border-gray-200 rounded-lg p-4"
                    >
                      {/* Card header */}
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-800">
                          Ticket #{ticketIdx + 1}
                        </h3>
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-gray-600">Payment Mode:</label>
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
                              <th className="text-left px-3 py-2">Item</th>
                              <th className="text-left px-3 py-2">Rate</th>
                              <th className="text-left px-3 py-2">Levy</th>
                              <th className="text-left px-3 py-2">Qty</th>
                              <th className="text-left px-3 py-2">Vehicle No</th>
                              <th className="text-right px-3 py-2">Amount</th>
                              <th className="text-center px-3 py-2 w-16"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ticket.items.map((item) => {
                              const itemDef = findItem(item.itemId);
                              const isVehicle = itemDef?.is_vehicle ?? false;
                              const amt = rowAmount(item);

                              return (
                                <tr key={item.tempId} className="border-t border-gray-200">
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemId}
                                      onChange={(e) =>
                                        updateItemField(
                                          ticket.tempId,
                                          item.tempId,
                                          "itemId",
                                          Number(e.target.value)
                                        )
                                      }
                                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full min-w-[160px]"
                                    >
                                      <option value={0}>-- Select Item --</option>
                                      {initData.items.map((it) => (
                                        <option key={it.id} value={it.id}>
                                          {it.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2 text-gray-700">
                                    {item.rate.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-gray-700">
                                    {item.levy.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="number"
                                      min={0}
                                      value={item.qty}
                                      onChange={(e) =>
                                        updateItemField(
                                          ticket.tempId,
                                          item.tempId,
                                          "qty",
                                          Math.max(0, parseInt(e.target.value) || 0)
                                        )
                                      }
                                      className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    {isVehicle ? (
                                      <input
                                        type="text"
                                        value={item.vehicleNo}
                                        onChange={(e) =>
                                          updateItemField(
                                            ticket.tempId,
                                            item.tempId,
                                            "vehicleNo",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Vehicle No"
                                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full min-w-[120px]"
                                      />
                                    ) : (
                                      <span className="text-gray-400 text-xs">N/A</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-800">
                                    {amt.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {ticket.items.length > 1 && (
                                      <button
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
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                        <button
                          onClick={() => addItemRow(ticket.tempId)}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        >
                          + Add Item
                        </button>
                        <div className="text-lg font-bold text-gray-800">
                          Ticket Total: <span className="text-blue-700">{tTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Grand total ── */}
              <div className="mt-6 bg-white rounded-lg shadow p-4 flex items-center justify-between">
                <span className="text-xl font-bold text-gray-800">Grand Total:</span>
                <span className="text-2xl font-bold text-blue-700">
                  {grandTotal(tickets).toFixed(2)}
                </span>
              </div>

              {/* ── Add Ticket button ── */}
              <div className="mt-4">
                <button
                  onClick={addTicket}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  + Add Ticket
                </button>
              </div>

              {/* ── Footer buttons ── */}
              <div className="mt-6 flex items-center gap-4">
                <button
                  onClick={resetForm}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAndPrint}
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save & Print"}
                </button>
              </div>
            </>
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
