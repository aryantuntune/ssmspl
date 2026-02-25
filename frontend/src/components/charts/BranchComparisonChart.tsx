"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface BranchData {
  branch_name: string;
  total_revenue: number;
  ticket_count: number;
}

interface BranchComparisonChartProps {
  data: BranchData[];
}

export default function BranchComparisonChart({
  data,
}: BranchComparisonChartProps) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="branch_name"
          tick={{ fontSize: 12 }}
          width={120}
        />
        <Tooltip
          formatter={(value: number | undefined, name: string | undefined) => {
            const v = value ?? 0;
            if (name === "total_revenue") {
              return [`\u20B9${v.toLocaleString("en-IN")}`, "Revenue"];
            }
            return [v.toLocaleString("en-IN"), "Tickets"];
          }}
          labelFormatter={(label) => String(label ?? "")}
        />
        <Bar dataKey="total_revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
