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

// ── Logo preloading ──

let cachedLogoBase64: string | null = null;

export async function preloadLogo(): Promise<string | null> {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Logo load failed"));
      img.src = "/images/logos/logo.png";
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    cachedLogoBase64 = canvas.toDataURL("image/png");
    return cachedLogoBase64;
  } catch {
    return null;
  }
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
  // YYYY-MM-DD -> DD-MM-YYYY
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

function formatFooterDateTime(ticketDate: string, createdAt: string | null, departure: string | null): string {
  const date = formatReceiptDate(ticketDate);
  const time = formatReceiptTime(createdAt, departure);
  return `${date} ${time}`;
}

// ── Receipt HTML builder ──

function buildReceiptHtml(data: ReceiptData, logoBase64: string | null, qrBase64: string | null): string {
  const {
    ticketNo,
    branchName,
    branchPhone,
    fromTo,
    ticketDate,
    createdAt,
    departure,
    items,
    netAmount,
    createdBy,
    paperWidth,
  } = data;

  const widthMm = paperWidth === "58mm" ? 58 : 80;
  const time = formatReceiptTime(createdAt, departure);
  const dateStr = formatReceiptDate(ticketDate);
  const footerDateTime = formatFooterDateTime(ticketDate, createdAt, departure);
  // Build item rows — single row per item
  const itemRows = items
    .map((item) => {
      const lines: string[] = [];
      lines.push(
        `<tr>` +
          `<td>${escHtml(item.name)}</td>` +
          `<td class="r">${fmtNum(item.quantity)}</td>` +
          `<td class="r">${fmtNum(item.rate)}</td>` +
          `<td class="r">${fmtNum(item.levy)}</td>` +
          `<td class="r">${fmtNum(item.amount)}</td>` +
          `</tr>`
      );
      if (item.vehicleNo) {
        lines.push(
          `<tr><td colspan="5" style="padding-left:8px;">&nbsp;&nbsp;${escHtml(item.vehicleNo)}</td></tr>`
        );
      }
      return lines.join("");
    })
    .join("");

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="width:80px;height:auto;margin:0 auto 4px;display:block;" />`
    : "";

  const qrHtml = qrBase64
    ? `<img src="${qrBase64}" style="width:140px;height:140px;margin:0 auto;display:block;" />`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Receipt #${ticketNo}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: ${paperWidth === "58mm" ? "11px" : "12px"};
    font-weight: 700;
    width: ${widthMm}mm;
    padding: 2mm 2mm;
    line-height: 1.2;
    color: #000;
    -webkit-print-color-adjust: exact;
  }
  .center { text-align: center; }
  .bold { font-weight: 900; }
  .dash { border-top: 2px solid #000; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  col.desc { width: auto; }
  col.num { width: ${paperWidth === "58mm" ? "36px" : "44px"}; }
  col.amt { width: ${paperWidth === "58mm" ? "42px" : "50px"}; }
  td { padding: 0 1px; vertical-align: top; }
  td.r { text-align: right; white-space: nowrap; }
  .r { text-align: right; }
  .header-line { display: flex; justify-content: space-between; }
  .note { font-size: ${paperWidth === "58mm" ? "9px" : "11px"}; font-weight: 900; line-height: 1.2; }
  @media print {
    body { margin: 0; padding: 2mm 2mm; transform: scale(0.92); transform-origin: top center; }
  }
</style></head><body>
${logoHtml}
<div class="center bold">SUVARNADURGA SHIPPING &amp;</div>
<div class="center bold">MARINE SERVICES PVT.LTD.</div>
<div class="center bold">${escHtml(branchName.toUpperCase())}</div>
<div class="center">MAHARASHTRA MARITIME BOARD APPROVAL</div>
<div class="center bold">${escHtml(fromTo)}</div>
<div class="header-line"><span>Ph: ${escHtml(branchPhone)}</span><span>TIME: ${time}</span></div>
<div class="header-line"><span>CASH MEMO NO: ${ticketNo}</span><span>DATE: ${dateStr}</span></div>
<div class="dash"></div>
<table>
<colgroup><col class="desc"/><col class="num"/><col class="num"/><col class="num"/><col class="amt"/></colgroup>
<tr class="bold"><td>Description</td><td class="r">Qty</td><td class="r">Rate</td><td class="r">Levy</td><td class="r">Amount</td></tr>
<tr><td colspan="5"><div class="dash"></div></td></tr>
${itemRows}
</table>
<div class="dash"></div>
<div class="header-line"><span class="bold">NET TOTAL WITH GOVT.TAX. :</span><span class="bold">${fmtNum(netAmount)}</span></div>
<div class="dash"></div>
<div class="note">NOTE: Tantrik Durustimule Velevar na sutlyas va ushira pohochlyas company jababdar rahanar nahi. Ferry Boatit TICKET DAKHVAVE.</div>
<div class="center note">HAPPY JOURNEY - www.carferry.online</div>
<div class="dash"></div>
<div class="header-line"><span>DATE: ${footerDateTime}</span><span>BY: ${escHtml(createdBy)}</span></div>
<div>CASH MEMO NO: ${ticketNo}</div>
<div class="header-line"><span>NET TOTAL WITH GOVT.TAX. :</span><span class="bold">${fmtNum(netAmount)}</span></div>
<div class="dash"></div>
${qrHtml}
</body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Format number: drop .00 decimals, keep non-zero decimals */
function fmtNum(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

// ── Print via hidden iframe ──

export async function printReceipt(data: ReceiptData): Promise<void> {
  // Preload logo and QR in parallel
  const [logoBase64, qrBase64] = await Promise.all([
    preloadLogo(),
    fetchQrBase64(data.ticketId),
  ]);

  const html = buildReceiptHtml(data, logoBase64, qrBase64);

  // Create hidden iframe
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // Wait for images to load before printing
  await new Promise<void>((resolve) => {
    const images = iframeDoc.querySelectorAll("img");
    if (images.length === 0) {
      resolve();
      return;
    }
    let loaded = 0;
    const checkDone = () => {
      loaded++;
      if (loaded >= images.length) resolve();
    };
    images.forEach((img) => {
      if (img.complete) {
        checkDone();
      } else {
        img.onload = checkDone;
        img.onerror = checkDone;
      }
    });
  });

  // Small delay for rendering
  await new Promise((r) => setTimeout(r, 100));

  iframe.contentWindow?.print();

  // Clean up after a delay to allow print dialog
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 5000);
}
