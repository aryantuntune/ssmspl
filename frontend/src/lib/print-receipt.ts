import api from "@/lib/api";

// ── Types ──

export type PaperWidth = "58mm" | "80mm";

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  rate: number;
  levy: number;
  amount: number;
  vehicleNo?: string | null;
}

export interface ReceiptData {
  ticketId: number;
  ticketNo: number;
  branchName: string;
  branchPhone: string;
  fromTo: string;
  ticketDate: string; // YYYY-MM-DD
  createdAt: string | null; // ISO datetime or null
  departure: string | null; // HH:MM or null
  items: ReceiptLineItem[];
  netAmount: number;
  createdBy: string;
  paperWidth: PaperWidth;
  paymentModeName: string; // e.g. "CASH", "UPI", "CASH / UPI"
}

// ── Paper width persistence (sessionStorage) ──

const PAPER_WIDTH_KEY = "ssmspl_receipt_paper_width";

export function getReceiptPaperWidth(): PaperWidth {
  if (typeof window === "undefined") return "80mm";
  return (sessionStorage.getItem(PAPER_WIDTH_KEY) as PaperWidth) || "80mm";
}

export function setReceiptPaperWidth(width: PaperWidth): void {
  sessionStorage.setItem(PAPER_WIDTH_KEY, width);
}

// ── QR code fetching ──

export async function fetchQrBase64(ticketId: number): Promise<string | null> {
  try {
    const res = await api.get(`/api/tickets/${ticketId}/qr`, {
      responseType: "arraybuffer",
    });
    const bytes = new Uint8Array(res.data);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return "data:image/png;base64," + btoa(binary);
  } catch {
    return null;
  }
}

// ── Date/time helpers ──

function formatReceiptDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

function formatReceiptTime(createdAt: string | null, departure: string | null): string {
  if (departure) return departure;
  if (!createdAt) {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
  try {
    const d = new Date(createdAt);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Format number: always show 2 decimal places */
function fmtNum(n: number): string {
  return n.toFixed(2);
}

// ── Receipt style config (shared by both print paths) ──

const NUM_COLS = 4; // Qty, Rate, Levy, Amt
const NUM_COL_PCT = Math.floor(64 / NUM_COLS); // each numeric column %
const DESC_COL_PCT = 100 - NUM_COL_PCT * NUM_COLS; // description column %

function getStyleConfig(paperWidth: PaperWidth) {
  const is58 = paperWidth === "58mm";
  return {
    fontSize:  is58 ? "11px" : "12px",
    tblFont:   is58 ? "8px"  : "9px",
    noteSize:  is58 ? "7px"  : "8px",
    coNameSz:  is58 ? "7px"  : "9px",
    apprSz:    is58 ? "7px"  : "8px",
    padSide:   is58 ? "3mm"  : "5mm",
  };
}

// ── Receipt parts builders ──
// buildReceiptBodyHtml   — inner body content, shared by both paths
// buildQzReceiptHtml     — full HTML document for QZ Tray (body-scoped styles)
// buildReceiptStyles     — scoped CSS for the main-window fallback path

function buildReceiptStyles(widthMm: number, paperWidth: PaperWidth): string {
  const { fontSize, tblFont, noteSize, coNameSz, apprSz, padSide } = getStyleConfig(paperWidth);

  return `
@page { size: ${widthMm}mm auto; margin: 0; }
[data-ssmspl-receipt] {
  font-family: "Courier New", Courier, monospace;
  font-size: ${fontSize};
  font-weight: 700;
  width: ${widthMm}mm;
  padding: 2mm ${padSide};
  line-height: 1.25;
  color: #000;
  overflow-wrap: break-word;
  word-wrap: break-word;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
[data-ssmspl-receipt] * { margin: 0; padding: 0; box-sizing: border-box; }
[data-ssmspl-receipt] .center { text-align: center; }
[data-ssmspl-receipt] .bold   { font-weight: 900; }
[data-ssmspl-receipt] .dash   { border-top: 2px solid #000; margin: 3px 0; }
[data-ssmspl-receipt] .co-name { font-family: Arial, Helvetica, sans-serif; font-size: ${coNameSz}; font-weight: 900; text-align: center; white-space: nowrap; letter-spacing: -0.2px; }
[data-ssmspl-receipt] .approval { font-family: Arial, Helvetica, sans-serif; font-size: ${apprSz}; font-weight: 700; text-align: center; }
[data-ssmspl-receipt] table   { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${tblFont}; }
[data-ssmspl-receipt] col.desc { width: ${DESC_COL_PCT}%; }
[data-ssmspl-receipt] col.num  { width: ${NUM_COL_PCT}%; }
[data-ssmspl-receipt] td      { padding: 1px 2px; vertical-align: top; }
[data-ssmspl-receipt] td:first-child { white-space: normal; word-break: break-word; }
[data-ssmspl-receipt] td.r    { text-align: right; white-space: nowrap; }
[data-ssmspl-receipt] .r      { text-align: right; }
[data-ssmspl-receipt] .info-row { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
[data-ssmspl-receipt] .info-row span { white-space: nowrap; }
[data-ssmspl-receipt] .info-row span:first-child { overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 1; }
[data-ssmspl-receipt] .note   { font-family: Arial, Helvetica, sans-serif; font-size: ${noteSize}; font-weight: 700; line-height: 1.2; }
[data-ssmspl-receipt] .total-line { display: flex; justify-content: space-between; align-items: baseline; }
[data-ssmspl-receipt] .qr-wrap { text-align: center; padding: 2px 0; }
@media print {
  body > *:not([data-ssmspl-receipt]) { display: none !important; }
  [data-ssmspl-receipt] { display: block !important; margin: 0; padding: 2mm ${padSide}; }
}
@media screen {
  [data-ssmspl-receipt] { display: none !important; }
}`.trim();
}

/** Full HTML document for QZ Tray — uses body-level (unscoped) styles. */
function buildQzReceiptHtml(
  data: ReceiptData,
  qrBase64: string | null,
): string {
  const widthMm = data.paperWidth === "58mm" ? 58 : 80;
  const { fontSize, tblFont, noteSize, coNameSz, apprSz, padSide } = getStyleConfig(data.paperWidth);
  const body = buildReceiptBodyHtml(data, qrBase64);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page { size: ${widthMm}mm auto; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Courier New", Courier, monospace;
  font-size: ${fontSize};
  font-weight: 700;
  width: ${widthMm}mm;
  padding: 2mm ${padSide};
  line-height: 1.25;
  color: #000;
  overflow-wrap: break-word;
  word-wrap: break-word;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.center { text-align: center; }
.bold   { font-weight: 900; }
.dash   { border-top: 2px solid #000; margin: 3px 0; }
.co-name { font-family: Arial, Helvetica, sans-serif; font-size: ${coNameSz}; font-weight: 900; text-align: center; white-space: nowrap; letter-spacing: -0.2px; }
.approval { font-family: Arial, Helvetica, sans-serif; font-size: ${apprSz}; font-weight: 700; text-align: center; }
table   { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${tblFont}; }
col.desc { width: ${DESC_COL_PCT}%; }
col.num  { width: ${NUM_COL_PCT}%; }
td      { padding: 1px 2px; vertical-align: top; }
td:first-child { white-space: normal; word-break: break-word; }
td.r    { text-align: right; white-space: nowrap; }
.r      { text-align: right; }
.info-row { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
.info-row span { white-space: nowrap; }
.info-row span:first-child { overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 1; }
.note   { font-family: Arial, Helvetica, sans-serif; font-size: ${noteSize}; font-weight: 700; line-height: 1.2; }
.total-line { display: flex; justify-content: space-between; align-items: baseline; }
.qr-wrap { text-align: center; padding: 2px 0; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function buildReceiptBodyHtml(
  data: ReceiptData,
  qrBase64: string | null,
): string {
  const {
    ticketNo, branchName, branchPhone, fromTo,
    ticketDate, createdAt, departure, items,
    netAmount, createdBy, paperWidth, paymentModeName,
  } = data;

  const widthMm = paperWidth === "58mm" ? 58 : 80;
  const time    = formatReceiptTime(createdAt, departure);
  const dateStr = formatReceiptDate(ticketDate);

  // Show only mobile numbers — strip STD landlines (start with 0) from display
  const displayPhone = branchPhone
    .split(",")
    .map(p => p.trim())
    .filter(p => p.length > 0 && !p.startsWith("0"))
    .join(", ");

  const itemRows = items.map((item) => {
    const rows: string[] = [];
    rows.push(
      `<tr>` +
        `<td>${escHtml(item.name)}</td>` +
        `<td class="r">${fmtNum(item.quantity)}</td>` +
        `<td class="r">${fmtNum(item.rate)}</td>` +
        `<td class="r">${fmtNum(item.levy)}</td>` +
        `<td class="r">${fmtNum(item.amount)}</td>` +
      `</tr>`,
    );
    if (item.vehicleNo) {
      rows.push(
        `<tr><td colspan="5" style="padding-left:8px;">&nbsp;&nbsp;${escHtml(item.vehicleNo)}</td></tr>`,
      );
    }
    return rows.join("");
  }).join("");

  const qrSize = widthMm === 58 ? 130 : 170;
  const qrHtml = qrBase64
    ? `<div class="qr-wrap"><img src="${qrBase64}" style="width:${qrSize}px;height:auto;" /></div>`
    : "";

  return `
<div class="co-name">SUVARNADURGA SHIPPING &amp; MARINE SERVICES PVT. LTD.</div>
<div class="center bold">${escHtml(branchName.toUpperCase())}</div>
<div class="approval">MAHARASHTRA MARITIME BOARD APPROVAL</div>
<div class="center bold">${escHtml(fromTo)}</div>
<div class="info-row"><span>Ph: ${escHtml(displayPhone)}</span><span>TIME: ${time}</span></div>
<div class="info-row"><span>Memo No: ${ticketNo}</span><span>DATE: ${dateStr}</span></div>
<div class="info-row"><span>Pay: ${escHtml(paymentModeName)}</span><span>BY: ${escHtml(createdBy)}</span></div>
<div class="dash"></div>
<table>
<colgroup><col class="desc"/><col class="num"/><col class="num"/><col class="num"/><col class="num"/></colgroup>
<tr class="bold"><td>Description</td><td class="r">Qty</td><td class="r">Rate</td><td class="r">Levy</td><td class="r">Amt</td></tr>
<tr><td colspan="5"><div class="dash"></div></td></tr>
${itemRows}
</table>
<div class="dash"></div>
<div class="total-line"><span class="bold">NET TOTAL INCL.TAX:</span><span class="bold">${fmtNum(netAmount)}</span></div>
<div class="dash"></div>
<div class="note">NOTE: Tantrik Durustimule Velevar na sutlyas va ushira pohochlyas company jababdar rahanar nahi. Ferry Boatit Ticket Dakhvaa.</div>
<div class="center note" style="margin-top:1px;">HAPPY JOURNEY - www.carferry.online</div>
<div class="dash"></div>
${qrHtml}`.trim();
}

// ── Print ──

/**
 * Print a receipt and return whether the print was initiated.
 *
 * - QZ Tray path: resolves `true` when the print job is spooled.
 * - window.print() path: resolves `true` after the browser print dialog
 *   closes (afterprint event).  Note: browsers cannot distinguish
 *   "Print" from "Cancel" in the dialog — `true` means the dialog was
 *   shown and dismissed, not that ink hit paper.
 * - Returns `false` only when the print could not be initiated at all
 *   (e.g. QZ Tray failed AND the DOM injection failed).
 */
export async function printReceipt(data: ReceiptData): Promise<boolean> {
  const qrBase64 = await fetchQrBase64(data.ticketId);

  const widthMm = data.paperWidth === "58mm" ? 58 : 80;

  // ── Path 1: QZ Tray (silent, no dialog) ──
  // Used when a printer has been selected in Printer Setup.
  const { getStoredPrinterName, qzPrint, qzConnect } = await import("./qz-service");
  const printerName = getStoredPrinterName();
  if (printerName) {
    let qzConnected = false;
    try {
      await qzConnect();
      qzConnected = true;
      const html = buildQzReceiptHtml(data, qrBase64);
      await qzPrint(printerName, html, widthMm);
      return true; // print job spooled successfully
    } catch {
      // If QZ Tray connected, the print job likely went through even if
      // the promise rejected (e.g. WebSocket closed after spooling).
      // Only fall through to window.print() if connection itself failed.
      if (qzConnected) return true;
    }
  }

  // ── Path 2: main-window window.print() (respects --kiosk-printing) ──
  const stylesCss = buildReceiptStyles(widthMm, data.paperWidth);
  const bodyHtml  = buildReceiptBodyHtml(data, qrBase64);

  // Inject a hidden receipt container + scoped print styles into the main
  // document, then call window.print() on the top-level window.
  // This is required for --kiosk-printing to suppress the dialog;
  // iframe.contentWindow.print() does NOT trigger the flag reliably.
  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-ssmspl-print-style", "");
  styleEl.textContent = stylesCss;

  const container = document.createElement("div");
  container.setAttribute("data-ssmspl-receipt", "");
  container.innerHTML = bodyHtml;

  document.head.appendChild(styleEl);
  document.body.appendChild(container);

  // Wait for images to load
  await new Promise<void>((resolve) => {
    const imgs = container.querySelectorAll("img");
    if (!imgs.length) { resolve(); return; }
    let n = 0;
    const done = () => { if (++n >= imgs.length) resolve(); };
    imgs.forEach((img) => (img.complete ? done() : ((img.onload = done), (img.onerror = done))));
  });

  await new Promise((r) => setTimeout(r, 80));

  const cleanup = () => {
    styleEl.remove();
    container.remove();
  };

  // Wait for the print dialog to close before resolving.
  // afterprint fires after the dialog is dismissed (or immediately if
  // --kiosk-printing is active and the job was sent silently).
  const printed = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => { cleanup(); resolve(true); }, 15000);
    window.addEventListener("afterprint", () => {
      clearTimeout(timeout);
      cleanup();
      resolve(true);
    }, { once: true });
    window.print();
  });

  return printed;
}
