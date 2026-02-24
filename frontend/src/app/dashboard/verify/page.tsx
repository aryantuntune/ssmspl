"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { User } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Shield,
  QrCode,
  Ticket,
  Globe,
  MonitorSmartphone,
  UserCheck,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  MapPin,
  Calendar,
  IndianRupee,
  Users,
  Loader2,
  Car,
  Camera,
  CameraOff,
  RotateCcw,
} from "lucide-react";

type SearchMode = "qr_scan" | "booking_no" | "ticket_no";

interface VerificationItem {
  item_name: string;
  quantity: number;
  is_vehicle: boolean;
  vehicle_no?: string | null;
}

interface VerificationResult {
  source: "booking" | "ticket";
  id: number;
  reference_no: number;
  status: string;
  route_name?: string | null;
  branch_name?: string | null;
  travel_date: string;
  departure?: string | null;
  net_amount: number;
  passenger_count: number;
  items: VerificationItem[];
  checked_in_at?: string | null;
  verification_code?: string | null;
}

interface Branch {
  id: number;
  name: string;
}

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
      month: "short",
      day: "2-digit",
    });
  }
  return dateString;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
    amount || 0
  );

export default function VerifyPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("qr_scan");
  const [searchValue, setSearchValue] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Check if user has permission to access this page
  useEffect(() => {
    api.get<User>("/api/auth/me").then(({ data }) => {
      if (data.menu_items?.includes("Ticket Verification")) {
        setAuthorized(true);
      } else {
        router.replace("/dashboard");
      }
    }).catch(() => {});
  }, [router]);

  // QR scanner state
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrCodeRef = useRef<any>(null);
  const lastScannedRef = useRef<string>("");

  // Load branches for ticket_no mode
  useEffect(() => {
    api
      .get("/api/branches/?limit=200")
      .then((res) => setBranches(res.data || []))
      .catch(() => setBranches([]));
  }, []);

  // Lookup by QR payload
  const lookupByQrPayload = useCallback(async (payload: string) => {
    setLoading(true);
    setError("");
    setResult(null);
    setSuccessMsg("");
    try {
      const res = await api.get<VerificationResult>("/api/verification/scan", {
        params: { payload },
      });
      setResult(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        setError("No booking or ticket found for this QR code.");
      } else if (status === 400) {
        setError("Invalid or tampered QR code.");
      } else {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail || "Search failed. Please try again.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Stop scanner completely
  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        if (state === 2 || state === 3) {
          await html5QrCodeRef.current.stop();
        }
      } catch {
        // ignore
      }
      html5QrCodeRef.current = null;
    }
    setScannerActive(false);
    setScannerPaused(false);
    lastScannedRef.current = "";
  }, []);

  // Resume scanner after viewing a result
  const resumeScanner = useCallback(() => {
    setResult(null);
    setError("");
    setSuccessMsg("");
    lastScannedRef.current = "";

    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        // State 3 = PAUSED
        if (state === 3) {
          html5QrCodeRef.current.resume();
          setScannerPaused(false);
          return;
        }
      } catch {
        // ignore
      }
    }
    // If resume failed or scanner lost, scannerActive is still true
    // so re-init will be handled by startScanner
    setScannerPaused(false);
  }, []);

  // Start scanner
  const startScanner = useCallback(async () => {
    setCameraError("");
    setError("");
    setResult(null);
    setSuccessMsg("");
    lastScannedRef.current = "";

    const { Html5Qrcode } = await import("html5-qrcode");

    const scannerId = "qr-scanner-region";
    if (!document.getElementById(scannerId)) {
      setCameraError("Scanner container not ready. Please try again.");
      return;
    }

    // Stop existing scanner if any
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
      } catch {
        // ignore
      }
    }

    const scanner = new Html5Qrcode(scannerId);
    html5QrCodeRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        async (decodedText: string) => {
          // Prevent re-scanning the same QR code while result is showing
          if (lastScannedRef.current === decodedText) return;
          lastScannedRef.current = decodedText;

          // Pause scanner (keeps camera on, stops decoding)
          try {
            scanner.pause(/* pauseVideo */ false);
          } catch {
            // ignore
          }
          setScannerPaused(true);

          // Auto-lookup the scanned QR
          await lookupByQrPayload(decodedText);
        },
        () => {
          // QR not found in frame - ignore
        }
      );
      setScannerActive(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not access camera";
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setCameraError(
          "Camera access denied. Please allow camera permissions in your browser settings."
        );
      } else if (msg.includes("NotFoundError")) {
        setCameraError(
          "No camera found on this device. Use manual search instead."
        );
      } else if (
        msg.includes("NotReadableError") ||
        msg.includes("TrackStartError")
      ) {
        setCameraError(
          "Camera is in use by another app. Close other apps using the camera and try again."
        );
      } else if (msg.includes("InsecureContext") || msg.includes("secure")) {
        setCameraError(
          "Camera requires HTTPS. Access this page via https:// or localhost."
        );
      } else {
        setCameraError(`Camera error: ${msg}`);
      }
    }
  }, [lookupByQrPayload]);

  // Auto-start scanner when QR mode is selected
  useEffect(() => {
    if (searchMode === "qr_scan") {
      // Small delay to ensure the DOM element is mounted
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        try {
          const state = html5QrCodeRef.current.getState();
          if (state === 2 || state === 3) {
            html5QrCodeRef.current.stop();
          }
        } catch {
          // ignore
        }
        html5QrCodeRef.current = null;
      }
    };
  }, []);

  // Stop scanner when switching away from qr_scan mode
  useEffect(() => {
    if (searchMode !== "qr_scan") {
      stopScanner();
    }
  }, [searchMode, stopScanner]);

  const handleSearch = async () => {
    const trimmed = searchValue.trim();
    if (!trimmed) {
      setError("Please enter a search value.");
      return;
    }

    if (searchMode === "ticket_no" && !branchId) {
      setError("Please select a branch for ticket lookup.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSuccessMsg("");

    try {
      let res;
      switch (searchMode) {
        case "booking_no":
          res = await api.get<VerificationResult>(
            "/api/verification/booking-number",
            { params: { booking_no: parseInt(trimmed) } }
          );
          break;
        case "ticket_no":
          res = await api.get<VerificationResult>("/api/verification/ticket", {
            params: {
              ticket_no: parseInt(trimmed),
              branch_id: parseInt(branchId),
            },
          });
          break;
      }
      if (res) setResult(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        setError(
          searchMode === "booking_no"
            ? "Booking not found. Check the booking number and try again."
            : "Ticket not found. Check the ticket number and branch."
        );
      } else {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail || "Search failed. Please try again.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!result?.verification_code) return;
    setCheckingIn(true);
    setError("");
    try {
      await api.post("/api/verification/check-in", {
        verification_code: result.verification_code,
      });
      setResult({
        ...result,
        status: "VERIFIED",
        checked_in_at: new Date().toISOString(),
      });
      setSuccessMsg(
        `${isPortalBooking ? "Booking" : "Ticket"} verified successfully!`
      );
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Verification failed. Please try again.";
      setError(detail);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleScanAnother = () => {
    if (searchMode === "qr_scan") {
      resumeScanner();
    } else {
      setResult(null);
      setError("");
      setSuccessMsg("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const isPortalBooking = result?.source === "booking";
  const isTicket = result?.source === "ticket";

  const statusConfig: Record<
    string,
    {
      variant: "default" | "destructive" | "secondary" | "outline";
      icon: typeof CheckCircle;
    }
  > = {
    VERIFIED: { variant: "default", icon: Shield },
    CONFIRMED: { variant: "default", icon: CheckCircle },
    PENDING: { variant: "secondary", icon: Clock },
    CANCELLED: { variant: "destructive", icon: XCircle },
  };

  if (!authorized) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Ticket Verification</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Scan QR code or look up by booking/ticket number
          </p>
        </div>
      </div>

      {/* Search Card */}
      <Card className="max-w-lg mx-auto">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search Mode */}
            <div>
              <Label className="mb-1 block">Search by</Label>
              <Select
                value={searchMode}
                onValueChange={(val) => {
                  setSearchMode(val as SearchMode);
                  setSearchValue("");
                  setBranchId("");
                  setError("");
                  setResult(null);
                  setSuccessMsg("");
                  setCameraError("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qr_scan">
                    Scan QR Code (Camera)
                  </SelectItem>
                  <SelectItem value="booking_no">
                    Booking No (Customer Portal)
                  </SelectItem>
                  <SelectItem value="ticket_no">
                    Ticket No (Billing Operator)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* QR Scanner Mode */}
            {searchMode === "qr_scan" && (
              <div className="space-y-3">
                {/* Camera viewfinder */}
                <div
                  ref={scannerRef}
                  className="relative rounded-lg overflow-hidden border border-border bg-black"
                >
                  <div
                    id="qr-scanner-region"
                    className="w-full"
                    style={{ minHeight: scannerActive ? undefined : "200px" }}
                  />
                  {!scannerActive && !loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/90 gap-3">
                      <QrCode className="h-12 w-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground text-center px-4">
                        Opening camera...
                      </p>
                    </div>
                  )}
                  {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        Verifying...
                      </p>
                    </div>
                  )}
                  {scannerPaused && !loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Badge className="text-sm py-1.5 px-3 bg-green-600">
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                        QR Scanned
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Camera controls */}
                <div className="flex gap-2">
                  {!scannerActive ? (
                    <Button
                      className="flex-1"
                      onClick={startScanner}
                      disabled={loading}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Open Camera
                    </Button>
                  ) : (
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={stopScanner}
                    >
                      <CameraOff className="h-4 w-4 mr-2" />
                      Stop Camera
                    </Button>
                  )}
                </div>

                {cameraError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <span>{cameraError}</span>
                      {(cameraError.includes("denied") ||
                        cameraError.includes("HTTPS")) && (
                        <p className="mt-1 text-xs opacity-80">
                          Tip: Camera only works on <strong>https://</strong> or{" "}
                          <strong>localhost</strong>. If using a local IP
                          address, switch to localhost:3000 instead.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Branch selector for ticket_no mode */}
            {searchMode === "ticket_no" && (
              <div>
                <Label className="mb-1 block">Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Manual Search Input (non-QR modes) */}
            {searchMode !== "qr_scan" && (
              <>
                <div>
                  <Label className="mb-1 block">
                    {searchMode === "booking_no"
                      ? "Booking Number"
                      : "Ticket Number"}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder={
                      searchMode === "booking_no"
                        ? "Enter booking number (e.g. 1, 2, 3...)"
                        : "Enter ticket number..."
                    }
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                  {searchMode === "booking_no" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      This is the # number shown on the customer&apos;s booking
                      confirmation
                    </p>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={handleSearch}
                  disabled={loading || !searchValue.trim()}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  {loading ? "Searching..." : "Search"}
                </Button>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Result Card */}
      {result && (
        <Card className="max-w-4xl mx-auto mt-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">
                  {isPortalBooking ? "Booking" : "Ticket"} #
                  {result.reference_no}
                </CardTitle>
                {/* Status Badge */}
                {(() => {
                  const cfg =
                    statusConfig[result.status?.toUpperCase()] ||
                    statusConfig.PENDING;
                  const Icon = cfg.icon;
                  return (
                    <Badge variant={cfg.variant}>
                      <Icon className="h-3 w-3 mr-1" />
                      {result.status}
                    </Badge>
                  );
                })()}
              </div>

              {/* Source Badge */}
              <Badge
                variant="outline"
                className={
                  isPortalBooking
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-amber-300 bg-amber-50 text-amber-700"
                }
              >
                {isPortalBooking ? (
                  <>
                    <Globe className="h-3 w-3 mr-1" />
                    Customer Portal
                  </>
                ) : (
                  <>
                    <MonitorSmartphone className="h-3 w-3 mr-1" />
                    Billing Operator
                  </>
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Verified status banner */}
            {result.status?.toUpperCase() === "VERIFIED" &&
              result.checked_in_at && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                  <Shield className="h-4 w-4 flex-shrink-0" />
                  <span>
                    Verified at{" "}
                    {new Date(result.checked_in_at).toLocaleString("en-IN")}
                  </span>
                </div>
              )}

            {/* Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="text-xs">Route</span>
                </div>
                <p className="text-sm font-semibold">
                  {result.route_name || "-"}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Ticket className="h-3.5 w-3.5" />
                  <span className="text-xs">Branch</span>
                </div>
                <p className="text-sm font-semibold">
                  {result.branch_name || "-"}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="text-xs">Travel Date</span>
                </div>
                <p className="text-sm font-semibold">
                  {formatDate(result.travel_date)}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs">Departure</span>
                </div>
                <p className="text-sm font-semibold">
                  {result.departure || "-"}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <IndianRupee className="h-3.5 w-3.5" />
                  <span className="text-xs">Net Amount</span>
                </div>
                <p className="text-sm font-semibold">
                  ₹{formatCurrency(result.net_amount)}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Users className="h-3.5 w-3.5" />
                  <span className="text-xs">Passengers</span>
                </div>
                <p className="text-sm font-semibold">
                  {result.passenger_count}
                </p>
              </div>
            </div>

            {/* Billed Via Info */}
            <div
              className={`rounded-lg border p-4 ${
                isPortalBooking
                  ? "border-blue-200 bg-blue-50/50"
                  : "border-amber-200 bg-amber-50/50"
              }`}
            >
              <div className="flex items-center gap-2">
                {isPortalBooking ? (
                  <Globe className="h-5 w-5 text-blue-600" />
                ) : (
                  <MonitorSmartphone className="h-5 w-5 text-amber-600" />
                )}
                <div>
                  <p className="text-sm font-semibold">
                    Billed via{" "}
                    {isPortalBooking
                      ? "Customer Portal (Online)"
                      : "Billing Operator (Branch Counter)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isPortalBooking
                      ? "This booking was made by the customer through the online portal"
                      : "This ticket was issued by a billing operator at the branch"}
                  </p>
                </div>
              </div>
            </div>

            {/* Items Table */}
            {result.items && result.items.length > 0 && (
              <div>
                <h4 className="text-sm font-bold mb-2">Items</h4>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Item</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead>Vehicle No</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
                            {item.item_name}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.quantity}
                          </TableCell>
                          <TableCell>
                            {item.is_vehicle && item.vehicle_no ? (
                              <span className="inline-flex items-center gap-1">
                                <Car className="h-3.5 w-3.5 text-muted-foreground" />
                                {item.vehicle_no}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              {/* Verify button - for CONFIRMED bookings and tickets */}
              {result.status?.toUpperCase() === "CONFIRMED" && (
                <Button onClick={handleCheckIn} disabled={checkingIn}>
                  {checkingIn ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UserCheck className="h-4 w-4 mr-2" />
                  )}
                  {checkingIn ? "Verifying..." : "Verify Passenger"}
                </Button>
              )}

              {/* Already verified indicator */}
              {result.status?.toUpperCase() === "VERIFIED" && (
                <Button variant="outline" disabled>
                  <Shield className="h-4 w-4 mr-2 text-green-600" />
                  Already Verified
                </Button>
              )}

              {/* Pending payment warning for bookings */}
              {isPortalBooking &&
                result.status?.toUpperCase() === "PENDING" && (
                  <Badge
                    variant="secondary"
                    className="py-2 px-3 text-amber-700 bg-amber-100"
                  >
                    <AlertCircle className="h-3.5 w-3.5 mr-1" />
                    Payment pending - cannot verify
                  </Badge>
                )}

              {/* Cancelled warning */}
              {result.status?.toUpperCase() === "CANCELLED" && (
                <Badge variant="destructive" className="py-2 px-3">
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  This {isTicket ? "ticket" : "booking"} is cancelled
                </Badge>
              )}

              {/* Scan Next / Search Another button */}
              <Button variant="outline" onClick={handleScanAnother}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {searchMode === "qr_scan" ? "Scan Next" : "Search Another"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
