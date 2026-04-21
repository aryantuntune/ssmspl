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

import type { ItemwiseLevyData } from "../page";

function fmt(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ItemwiseLevyReport({ data }: { data: ItemwiseLevyData }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center mb-4">
          <h2 className="text-base font-bold">
            SUVARNADURGA SHIPPING &amp; MARINE SERVICES PVT.LTD.
          </h2>
          <p className="text-sm font-semibold">{data.route_label}</p>
          <p className="text-xs text-gray-600">
            Itemwise Levy Summary From : {data.date_from} To : {data.date_to}
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Levy</TableHead>
                {data.branches.map((b) => (
                  <TableHead key={b.id} className="text-right">
                    {b.name}
                  </TableHead>
                ))}
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4 + data.branches.length} className="text-center text-gray-500">
                    No data for the selected range.
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((r) => (
                  <TableRow key={`${r.item_id}-${r.levy}`}>
                    <TableCell>{r.item_name}</TableCell>
                    <TableCell className="text-right">{fmt(r.levy)}</TableCell>
                    {data.branches.map((b) => (
                      <TableCell key={b.id} className="text-right">
                        {(r.branch_quantities[String(b.id)] ?? 0).toLocaleString("en-IN")}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      {r.total_quantity.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={2 + data.branches.length + 1} className="text-right">
                  Total
                </TableCell>
                <TableCell className="text-right">{fmt(data.grand_total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <div className="mt-6 max-w-sm ml-auto">
          <p className="font-semibold mb-2">Summary :</p>
          <table className="w-full text-sm">
            <tbody>
              {data.branches.map((b) => (
                <tr key={b.id}>
                  <td className="py-1 font-semibold">{b.name}</td>
                  <td className="py-1 text-right">
                    {fmt(data.branch_totals[String(b.id)] ?? "0")}
                  </td>
                </tr>
              ))}
              <tr className="border-t font-bold">
                <td className="py-1">Total Amount</td>
                <td className="py-1 text-right">{fmt(data.grand_total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
