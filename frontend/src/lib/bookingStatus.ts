/**
 * Customer-facing booking status labels.
 *
 * The backend stores raw states (PENDING, CONFIRMED, VERIFIED, CANCELLED,
 * EXPIRED). Showing those verbatim confuses customers — "Pending" in particular
 * reads as "booked / being processed" when it actually means the ticket is not
 * paid yet. Map them to plain-language labels here so every customer screen
 * stays consistent.
 */
const STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting Payment",
  confirmed: "Confirmed",
  verified: "Verified",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

export function bookingStatusLabel(status?: string): string {
  if (!status) return "Unknown";
  const key = status.toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  // Fallback: Title-case whatever the backend sent.
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
