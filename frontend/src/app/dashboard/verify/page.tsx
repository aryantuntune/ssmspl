"use client";

import { useState } from "react";
import api from "@/lib/api";
import { Ticket } from "@/types";
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
import { Search, Shield, Printer } from "lucide-react";

type SearchMode = "id" | "ticket_no";

function buildPrintHtml(ticket: Ticket, maxWidth: string): string {
  const itemRows = (ticket.items || [])
    .map((ti) => {
      const opacity = ti.is_cancelled ? "opacity:0.5;" : "";
      return `<tr style="${opacity}">
        <td style="padding:4px 6px;border-bottom:1px solid #eee;">${ti.item_name || ti.item_id}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;">${ti.rate.toFixed(2)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;">${ti.levy.toFixed(2)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">${ti.quantity}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;">${ti.vehicle_no || "-"}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;">${ti.amount.toFixed(2)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;">${ti.is_cancelled ? "Cancelled" : "Active"}</td>
      </tr>`;
    })
    .join("");

  const paymentRows = (ticket.payments || [])
    .map(
      (p) => `<tr>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;">${p.payment_mode_name || p.payment_mode_id}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;">${p.amount.toFixed(2)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;">${p.ref_no || "-"}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><title>Ticket #${ticket.ticket_no || ticket.id}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 10px auto; color: #333; max-width: ${maxWidth}; font-size: 11px; }
  .header { text-align: center; margin-bottom: 10px; }
  .header h2 { margin: 0 0 2px; font-size: 14px; }
  .header p { margin: 0; font-size: 10px; color: #666; }
  .info { margin-bottom: 8px; font-size: 11px; }
  .info div { margin-bottom: 2px; }
  .info span { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 8px; }
  th { background: #f5f5f5; padding: 4px 6px; text-align: left; border-bottom: 2px solid #ddd; font-size: 10px; }
  .totals { text-align: right; font-size: 11px; margin-top: 6px; }
  .totals div { margin-bottom: 2px; }
  .totals .net { font-size: 13px; font-weight: 700; }
  .section-title { font-size: 11px; font-weight: 700; margin: 8px 0 4px; }
  .status { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .status-active { background: #dcfce7; color: #166534; }
  .status-cancelled { background: #fee2e2; color: #991b1b; }
  @media print { body { margin: 0 auto; } }
</style></head><body>
<div class="header">
  <h2>SSMSPL - Ferry Ticket</h2>
  <p>Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd.</p>
</div>
<div class="info">
  <div>Ticket No: <span>${ticket.ticket_no}</span>
    &nbsp;&nbsp;
    <span class="status ${ticket.is_cancelled ? "status-cancelled" : "status-active"}">${ticket.is_cancelled ? "CANCELLED" : "ACTIVE"}</span>
  </div>
  <div>Date: <span>${ticket.ticket_date}</span> &nbsp; Departure: <span>${ticket.departure || "-"}</span></div>
  <div>Branch: <span>${ticket.branch_name || ticket.branch_id}</span></div>
  <div>Route: <span>${ticket.route_name || ticket.route_id}</span></div>
  <div>Payment Mode: <span>${ticket.payment_mode_name || ticket.payment_mode_id}</span></div>
</div>
<div class="section-title">Items</div>
<table>
  <thead><tr>
    <th>Item</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Levy</th>
    <th style="text-align:center;">Qty</th><th>Vehicle</th><th style="text-align:right;">Amount</th><th>Status</th>
  </tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="totals">
  <div>Amount: ${ticket.amount.toFixed(2)}</div>
  <div>Discount: ${(ticket.discount || 0).toFixed(2)}</div>
  <div class="net">Net Amount: ${ticket.net_amount.toFixed(2)}</div>
</div>
${
  ticket.payments && ticket.payments.length > 0
    ? `<div class="section-title">Payments</div>
<table>
  <thead><tr>
    <th>Payment Mode</th><th style="text-align:right;">Amount</th><th>Reference</th>
  </tr></thead>
  <tbody>${paymentRows}</tbody>
</table>`
    : ""
}
</body></html>`;
}

export default function VerifyPage() {
  const [searchMode, setSearchMode] = useState<SearchMode>("id");
  const [searchValue, setSearchValue] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    const trimmed = searchValue.trim();
    if (!trimmed) {
      setError("Please enter a search value.");
      return;
    }

    setLoading(true);
    setError("");
    setTicket(null);

    try {
      if (searchMode === "id") {
        const res = await api.get<Ticket>(`/api/tickets/${trimmed}`);
        setTicket(res.data);
      } else {
        const listRes = await api.get<Ticket[]>(
          `/api/tickets/?ticket_no_filter=${trimmed}&limit=1`
        );
        if (listRes.data.length === 0) {
          setError("Ticket not found.");
          return;
        }
        // Fetch full details with items and payments
        const detailRes = await api.get<Ticket>(
          `/api/tickets/${listRes.data[0].id}`
        );
        setTicket(detailRes.data);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        setError("Ticket not found.");
      } else {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail || "Failed to search ticket. Please try again.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const handlePrint = (width: "58mm" | "80mm") => {
    if (!ticket) return;
    const maxWidth = width === "58mm" ? "200px" : "280px";
    const printHtml = buildPrintHtml(ticket, maxWidth);
    const printWindow = window.open("", "_blank", "width=600,height=700");
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Ticket Verification</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Verify and inspect ferry tickets
          </p>
        </div>
      </div>

      {/* Search Card */}
      <Card className="max-w-lg mx-auto">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <Label className="mb-1 block">Search by</Label>
              <Select
                value={searchMode}
                onValueChange={(val) => {
                  setSearchMode(val as SearchMode);
                  setSearchValue("");
                  setError("");
                  setTicket(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">Ticket ID</SelectItem>
                  <SelectItem value="ticket_no">Ticket No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1 block">
                {searchMode === "id" ? "Ticket ID" : "Ticket No"}
              </Label>
              <Input
                type="number"
                min={1}
                placeholder={
                  searchMode === "id"
                    ? "Enter ticket ID..."
                    : "Enter ticket number..."
                }
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSearch}
              disabled={loading || !searchValue.trim()}
            >
              <Search className="h-4 w-4 mr-2" />
              {loading ? "Searching..." : "Search"}
            </Button>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                {error}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ticket Details Card */}
      {ticket && (
        <Card className="max-w-4xl mx-auto mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Ticket #{ticket.id}
              </CardTitle>
              <Badge
                variant={ticket.is_cancelled ? "destructive" : "default"}
              >
                {ticket.is_cancelled ? "Cancelled" : "Active"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Ticket No
                </span>
                <span className="text-sm font-semibold">
                  {ticket.ticket_no}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Branch
                </span>
                <span className="text-sm">
                  {ticket.branch_name || ticket.branch_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Route
                </span>
                <span className="text-sm">
                  {ticket.route_name || ticket.route_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Date
                </span>
                <span className="text-sm">{ticket.ticket_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Departure
                </span>
                <span className="text-sm">{ticket.departure || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Payment Mode
                </span>
                <span className="text-sm">
                  {ticket.payment_mode_name || ticket.payment_mode_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Amount
                </span>
                <span className="text-sm">{ticket.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Discount
                </span>
                <span className="text-sm">
                  {(ticket.discount || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Net Amount
                </span>
                <span className="text-sm font-semibold">
                  {ticket.net_amount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Items Table */}
            {ticket.items && ticket.items.length > 0 && (
              <div>
                <h4 className="text-sm font-bold mb-2">Items</h4>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Item Name</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Levy</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Vehicle No</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ticket.items.map((ti) => (
                        <TableRow
                          key={ti.id}
                          className={ti.is_cancelled ? "opacity-50" : ""}
                        >
                          <TableCell>
                            {ti.item_name || ti.item_id}
                          </TableCell>
                          <TableCell className="text-right">
                            {ti.rate.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {ti.levy.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {ti.quantity}
                          </TableCell>
                          <TableCell>{ti.vehicle_no || "-"}</TableCell>
                          <TableCell className="text-right font-medium">
                            {ti.amount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                ti.is_cancelled ? "destructive" : "default"
                              }
                            >
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

            {/* Payments Table */}
            {ticket.payments && ticket.payments.length > 0 && (
              <div>
                <h4 className="text-sm font-bold mb-2">Payments</h4>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Payment Mode</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ticket.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            {p.payment_mode_name || p.payment_mode_id}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {p.amount.toFixed(2)}
                          </TableCell>
                          <TableCell>{p.ref_no || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => handlePrint("58mm")}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print 58mm
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePrint("80mm")}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print 80mm
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
