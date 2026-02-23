"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import CustomerLayout from "@/components/customer/CustomerLayout";
import api from "@/lib/api";
import {
  Calendar,
  MapPin,
  Clock,
  Ticket,
  ChevronLeft,
  ChevronRight,
  Download,
  QrCode,
  Inbox,
  ArrowRight,
} from "lucide-react";

const formatDate = (dateString: string) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

const StatusBadge = ({ status }: { status?: string }) => {
  const statusStyles: Record<string, string> = {
    verified: "bg-emerald-100 text-emerald-800",
    confirmed: "bg-green-100 text-green-800",
    pending: "bg-amber-100 text-amber-800",
    cancelled: "bg-red-100 text-red-800",
    completed: "bg-sky-100 text-sky-800",
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
        statusStyles[status?.toLowerCase() || ""] ||
        "bg-slate-100 text-slate-800"
      }`}
    >
      {status
        ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
        : "Unknown"}
    </span>
  );
};

interface BookingItem {
  item_name?: string;
  quantity?: number;
}

interface Booking {
  id: number;
  booking_no: number;
  status: string;
  branch_name?: string;
  route_name?: string;
  travel_date?: string;
  departure?: string;
  net_amount: number;
  is_cancelled: boolean;
  created_at?: string;
  items?: BookingItem[];
}

interface PaginatedBookings {
  data: Booking[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export default function HistoryPage() {
  const [bookings, setBookings] = useState<PaginatedBookings | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [qrModal, setQrModal] = useState<{ url: string; bookingNo: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const goToPage = (page: number) => {
    setLoading(true);
    setCurrentPage(page);
  };

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/portal/bookings?page=${currentPage}&page_size=10`)
      .then((res) => {
        if (!cancelled) {
          setBookings(res.data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBookings(null);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [currentPage]);

  const bookingData = bookings?.data || [];
  const totalPages = bookings?.total_pages || 1;

  return (
    <CustomerLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">
              Booking History
            </h1>
            <p className="text-slate-500">
              View all your past and upcoming ferry bookings
            </p>
          </div>
          <Link
            href="/customer/dashboard"
            className="mt-4 md:mt-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 font-semibold shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all duration-300"
          >
            <Ticket className="w-5 h-5" />
            Book New Ferry
          </Link>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700 font-bold ml-4">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
          </div>
        ) : bookingData.length > 0 ? (
          <div className="space-y-6">
            {bookingData.map((booking) => {
              const [fromName, toName] = (booking.route_name || "").split(" - ");

              return (
                <Link
                  key={booking.id}
                  href={`/customer/history/${booking.id}`}
                  className="block bg-white rounded-3xl shadow-lg border border-sky-100 overflow-hidden hover:shadow-xl transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                      {/* Booking Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                            <Ticket className="w-6 h-6 text-sky-600" />
                          </div>
                          <div>
                            <p className="font-mono text-sm text-slate-500">
                              #{booking.booking_no}
                            </p>
                            <StatusBadge status={booking.status} />
                          </div>
                        </div>

                        {/* Route */}
                        <div className="flex items-center gap-3 mb-4">
                          <MapPin className="w-5 h-5 text-sky-600" />
                          <span className="font-semibold text-slate-800">
                            {fromName || "Unknown"}
                          </span>
                          <ArrowRight className="w-4 h-4 text-slate-400" />
                          <span className="font-semibold text-amber-600">
                            {toName || "Unknown"}
                          </span>
                        </div>

                        {/* Date & Time */}
                        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span>
                              {formatDate(booking.travel_date || "")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span>{booking.departure || "-"}</span>
                          </div>
                        </div>

                        {/* Items Summary */}
                        {booking.items && booking.items.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {booking.items.slice(0, 3).map((item, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"
                              >
                                {item.item_name} x{item.quantity}
                              </span>
                            ))}
                            {booking.items.length > 3 && (
                              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                                +{booking.items.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Amount & Actions */}
                      <div className="flex flex-col items-end gap-4">
                        <div className="text-right">
                          <p className="text-sm text-slate-500 mb-1">
                            Total Amount
                          </p>
                          <p className="text-2xl font-bold text-sky-600">
                            ₹{formatCurrency(booking.net_amount)}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          {booking.status?.toLowerCase() === "confirmed" && (
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                try {
                                  const res = await api.get(
                                    `/api/portal/bookings/${booking.id}/qr`,
                                    { responseType: "blob" }
                                  );
                                  const url = URL.createObjectURL(res.data);
                                  setQrModal({ url, bookingNo: booking.booking_no });
                                } catch {
                                  setErrorMsg("Failed to load QR code. Please try again.");
                                  setTimeout(() => setErrorMsg(null), 4000);
                                }
                              }}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-50 text-sky-700 font-medium hover:bg-sky-100 transition-colors"
                            >
                              <QrCode className="w-4 h-4" />
                              <span>View QR</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.location.href = `/customer/history/${booking.id}`;
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-6">
                <p className="text-sm text-slate-600">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className={`flex items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                      currentPage === 1
                        ? "text-slate-400 bg-slate-100 cursor-not-allowed"
                        : "text-slate-700 bg-white border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className={`flex items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                      currentPage === totalPages
                        ? "text-slate-400 bg-slate-100 cursor-not-allowed"
                        : "text-slate-700 bg-white border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-3xl shadow-lg border border-sky-100 p-12 text-center">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-sky-100 flex items-center justify-center mb-6">
              <Inbox className="w-10 h-10 text-sky-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">
              No Bookings Yet
            </h3>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              You haven&apos;t made any ferry bookings yet. Book your first
              ferry ticket and start exploring the beautiful Konkan coast!
            </p>
            <Link
              href="/customer/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 font-semibold shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all duration-300"
            >
              <Ticket className="w-5 h-5" />
              Book Your First Ferry
            </Link>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {qrModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            URL.revokeObjectURL(qrModal.url);
            setQrModal(null);
          }}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-slate-800 mb-1">
              Booking #{qrModal.bookingNo}
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Show this QR code at the jetty for boarding
            </p>
            <div className="flex justify-center mb-6">
              <img
                src={qrModal.url}
                alt="Booking QR Code"
                className="w-72 h-72 sm:w-80 sm:h-80"
              />
            </div>
            <button
              onClick={() => {
                URL.revokeObjectURL(qrModal.url);
                setQrModal(null);
              }}
              className="w-full py-3 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}
