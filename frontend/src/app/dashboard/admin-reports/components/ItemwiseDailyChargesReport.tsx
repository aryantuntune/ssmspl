"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { DailyChargesData } from "../page";

function fmt(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ItemwiseDailyChargesReport({ data }: { data: DailyChargesData }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="text-center">
          <h2 className="text-base font-bold">
            SUVARNADURGA SHIPPING &amp; MARINE SERVICES PVT.LTD.
          </h2>
          <p className="text-sm font-semibold">{data.route_label}</p>
          <p className="text-xs text-gray-600">
            Itemwise Daily Collection Charges Summary From Date : {data.date_from} To{" "}
            {data.date_to}
          </p>
        </div>

        {data.dates.length === 0 && (
          <p className="text-center text-gray-500">No data for the selected range.</p>
        )}

        {data.dates.map((ds) => (
          <div key={ds.date} className="border rounded-lg p-4">
            <p className="text-center font-semibold mb-3">{dateLabel(ds.date)}</p>

            {ds.branches.map((bs) => (
              <div key={bs.branch_id} className="mb-4">
                <p className="text-center font-semibold text-sm mb-1">{bs.branch_name}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ItemCategoryName</TableHead>
                      <TableHead className="text-right">Charges</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bs.rows.map((r, i) => (
                      <TableRow key={`${r.item_id}-${r.charges}-${i}`}>
                        <TableCell>{r.item_name}</TableCell>
                        <TableCell className="text-right">{fmt(r.charges)}</TableCell>
                        <TableCell className="text-right">
                          {r.quantity.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-gray-50">
                      <TableCell colSpan={3}>{bs.branch_name}</TableCell>
                      <TableCell className="text-right">{fmt(bs.subtotal)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ))}

            <div className="flex justify-between font-bold border-t pt-2 text-sm">
              <span>Total for {data.route_label}</span>
              <span>{fmt(ds.day_total)}</span>
            </div>
          </div>
        ))}

        {data.dates.length > 0 && (
          <div className="flex justify-between font-bold text-base border-t-2 pt-3">
            <span>Grand Total</span>
            <span>{fmt(data.grand_total)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
