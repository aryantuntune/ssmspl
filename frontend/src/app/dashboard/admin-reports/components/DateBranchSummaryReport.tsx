"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { DateBranchData } from "../page";

function fmt(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function DateBranchSummaryReport({ data }: { data: DateBranchData }) {
  const hasData = data.rows.some((r) =>
    Object.values(r.cells).some((v) => Number(v) > 0)
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center mb-4">
          <h2 className="text-base font-bold">
            SUVARNADURGA SHIPPING &amp; MARINE SERVICES PVT.LTD.
          </h2>
          <p className="text-sm font-semibold">{data.route_label}</p>
          <p className="text-xs text-gray-600">
            Date Wise Branch Summary From Date : {data.date_from} To {data.date_to} — Payment
            Mode: Cash Memo &amp; GPay
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                {data.columns.map((c) => (
                  <TableHead key={c.key} className="text-right">
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hasData ? (
                <TableRow>
                  <TableCell
                    colSpan={2 + data.columns.length}
                    className="text-center text-gray-500"
                  >
                    No data for the selected range.
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell>{dateLabel(r.date)}</TableCell>
                    {data.columns.map((c) => {
                      const val = Number(r.cells[c.key] ?? 0);
                      return (
                        <TableCell key={c.key} className="text-right">
                          {val > 0 ? fmt(val) : ""}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-semibold">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                {data.columns.map((c) => (
                  <TableCell key={c.key} className="text-right">
                    {fmt(data.column_totals[c.key] ?? "0")}
                  </TableCell>
                ))}
                <TableCell className="text-right">{fmt(data.grand_total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
