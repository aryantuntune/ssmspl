"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import CustomerLayout from "@/components/customer/CustomerLayout";
import api from "@/lib/api";
import {
  Calendar,
  Clock,
  Ticket,
  ArrowLeft,
  Download,
  IndianRupee,
  Ship,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Percent,
  ShieldCheck,
} from "lucide-react";

const formatDate = (dateString: string) => {
  if (!dateString) return "-";
  const parts = dateString.split("-");
  if (parts.length === 3) {
    const date = new Date(
      parseInt(parts[0]),
      parseInt(parts[1]) - 1,
      parseInt(parts[2])
    );
    return date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  }
  const date = new Date(dateString);
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

const statusConfig: Record<
  string,
  { style: string; Icon: typeof CheckCircle }
> = {
  verified: {
    style: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Icon: ShieldCheck,
  },
  confirmed: {
    style: "bg-green-100 text-green-800 border-green-200",
    Icon: CheckCircle,
  },
  completed: {
    style: "bg-sky-100 text-sky-800 border-sky-200",
    Icon: CheckCircle,
  },
  pending: {
    style: "bg-amber-100 text-amber-800 border-amber-200",
    Icon: AlertCircle,
  },
  cancelled: {
    style: "bg-red-100 text-red-800 border-red-200",
    Icon: XCircle,
  },
};

const StatusBadge = ({ status }: { status?: string }) => {
  const key = status?.toLowerCase() || "";
  const config = statusConfig[key] || {
    style: "bg-slate-100 text-slate-800 border-slate-200",
    Icon: AlertCircle,
  };
  const { style, Icon } = config;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border ${style}`}
    >
      <Icon className="w-4 h-4" />
      {status
        ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
        : "Unknown"}
    </span>
  );
};

interface BookingItemData {
  id: number;
  booking_id: number;
  item_id: number;
  item_name?: string;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no?: string;
  is_cancelled: boolean;
  amount: number;
}

interface BookingData {
  id: number;
  booking_no: number;
  status: string;
  verification_code?: string;
  branch_name?: string;
  route_name?: string;
  travel_date?: string;
  departure?: string;
  amount: number;
  discount: number;
  net_amount: number;
  is_cancelled: boolean;
  created_at?: string;
  items?: BookingItemData[];
}

export default function BookingViewPage() {
  const params = useParams();
  const bookingId = params.id;
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch booking details
  useEffect(() => {
    if (!bookingId) return;
    api
      .get(`/api/portal/bookings/${bookingId}`)
      .then((res) => {
        setBooking(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bookingId]);

  // Auto-fetch QR when booking is confirmed or verified
  useEffect(() => {
    const s = booking?.status?.toUpperCase();
    if (!booking || (s !== "CONFIRMED" && s !== "VERIFIED")) return;
    api
      .get(`/api/portal/bookings/${bookingId}/qr`, { responseType: "blob" })
      .then((res) => {
        const url = URL.createObjectURL(res.data);
        setQrUrl(url);
      })
      .catch(() => {});
    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.status, bookingId]);

  if (loading) {
    return (
      <CustomerLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        </div>
      </CustomerLayout>
    );
  }

  if (!booking) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 text-center py-20">
          <p className="text-slate-500 text-lg">Booking not found.</p>
          <Link
            href="/customer/history"
            className="inline-flex items-center gap-2 mt-4 text-sky-600 hover:text-sky-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to History
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const routeParts = booking.route_name?.split(" - ") || [];
  const fromName = routeParts[0] || "N/A";
  const toName = routeParts[1] || "N/A";
  const upperStatus = booking.status?.toUpperCase();
  const isConfirmed = upperStatus === "CONFIRMED";
  const isVerified = upperStatus === "VERIFIED";
  const isPending = upperStatus === "PENDING";
  const showQr = (isConfirmed || isVerified) && !!qrUrl;

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Back Button */}
        <Link
          href="/customer/history"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-sky-600 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to History</span>
        </Link>

        {errorMsg && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700 font-bold ml-4">&times;</button>
          </div>
        )}

        {/* Ticket Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-sky-100 overflow-hidden">
          {/* Header with QR */}
          <div className="bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-8 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Ticket className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-sky-100 text-sm">Booking Reference</p>
                  <p className="text-2xl font-bold font-mono">
                    #{booking.booking_no}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={booking.status} />
                  </div>
                </div>
              </div>
              {/* QR Code - visible for confirmed and verified bookings */}
              {showQr && (
                <div className="flex-shrink-0 bg-white rounded-2xl p-2.5 shadow-lg">
                  <img
                    src={qrUrl}
                    alt="Boarding QR Code"
                    className="w-36 h-36 sm:w-40 sm:h-40"
                  />
                </div>
              )}
            </div>
            {showQr && (
              <p className="text-sky-100 text-xs mt-3 text-right">
                {isVerified
                  ? "Boarding verified"
                  : "Show this QR at the jetty for boarding"}
              </p>
            )}
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Route Section */}
            <div className="bg-sky-50 rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-slate-500 mb-1">From</p>
                  <p className="text-lg font-bold text-slate-800">
                    {fromName}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
                  <Ship className="w-6 h-6 text-sky-600" />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm text-slate-500 mb-1">To</p>
                  <p className="text-lg font-bold text-amber-600">{toName}</p>
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div
              className={`grid grid-cols-2 ${booking.discount > 0 ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4`}
            >
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs">Date</span>
                </div>
                <p className="font-semibold text-slate-800">
                  {formatDate(booking.travel_date || "")}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs">Time</span>
                </div>
                <p className="font-semibold text-slate-800">
                  {booking.departure || "-"}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <IndianRupee className="w-4 h-4" />
                  <span className="text-xs">Amount</span>
                </div>
                <p className="font-semibold text-sky-600">
                  ₹{formatCurrency(booking.net_amount)}
                </p>
              </div>
              {booking.discount > 0 && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Percent className="w-4 h-4" />
                    <span className="text-xs">Discount</span>
                  </div>
                  <p className="font-semibold text-green-600">
                    ₹{formatCurrency(booking.discount)}
                  </p>
                </div>
              )}
            </div>

            {/* Items */}
            {booking.items && booking.items.length > 0 && (
              <div className="border-t border-slate-100 pt-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                  Booked Items
                </h3>
                <div className="space-y-3">
                  {booking.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="flex items-center justify-between bg-slate-50 rounded-xl p-4"
                    >
                      <div>
                        <p className="font-medium text-slate-800">
                          {item.item_name}
                        </p>
                        {item.vehicle_no && (
                          <p className="text-sm text-slate-500">
                            Vehicle: {item.vehicle_no}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500">
                          x{item.quantity}
                        </p>
                        <p className="font-semibold text-slate-800">
                          ₹{formatCurrency(item.amount)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="border-t border-slate-100 pt-6 flex flex-wrap gap-3">
              {isPending && (
                <button
                  onClick={async () => {
                    setPaying(true);
                    try {
                      const res = await api.post(
                        `/api/portal/bookings/${bookingId}/pay`
                      );
                      setBooking(res.data);
                    } catch {
                      setErrorMsg("Payment failed. Please try again.");
                      setTimeout(() => setErrorMsg(null), 4000);
                    }
                    setPaying(false);
                  }}
                  disabled={paying}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <IndianRupee className="w-5 h-5" />
                  <span>{paying ? "Processing..." : "Pay Now"}</span>
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
              >
                <Download className="w-5 h-5" />
                <span>Download Ticket</span>
              </button>
              {isConfirmed && (
                <button
                  onClick={async () => {
                    if (
                      !confirm(
                        "Are you sure you want to cancel this booking?"
                      )
                    )
                      return;
                    setCancelling(true);
                    try {
                      const res = await api.post(
                        `/api/portal/bookings/${bookingId}/cancel`
                      );
                      setBooking(res.data);
                    } catch {
                      setErrorMsg("Failed to cancel booking. Please try again.");
                      setTimeout(() => setErrorMsg(null), 4000);
                    }
                    setCancelling(false);
                  }}
                  disabled={cancelling}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-100 text-red-700 font-semibold hover:bg-red-200 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" />
                  <span>
                    {cancelling ? "Cancelling..." : "Cancel Booking"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
