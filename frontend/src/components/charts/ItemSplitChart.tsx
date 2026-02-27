"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ItemData {
  item_name: string;
  is_vehicle: boolean;
  total_revenue: number;
}

interface ItemSplitChartProps {
  data: ItemData[];
}

const COLORS = ["#3b82f6", "#22c55e"];

export default function ItemSplitChart({ data }: ItemSplitChartProps) {
  const grouped = useMemo(() => {
    const vehicleRevenue = data
      .filter((d) => d.is_vehicle)
      .reduce((sum, d) => sum + d.total_revenue, 0);
    const passengerRevenue = data
      .filter((d) => !d.is_vehicle)
      .reduce((sum, d) => sum + d.total_revenue, 0);

    return [
      { name: "Vehicles", value: vehicleRevenue },
      { name: "Passengers", value: passengerRevenue },
    ].filter((d) => d.value > 0);
  }, [data]);

  if (grouped.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={grouped}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          dataKey="value"
          nameKey="name"
          paddingAngle={2}
        >
          {grouped.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number | undefined) => [
            `\u20B9${(value ?? 0).toLocaleString("en-IN")}`,
            "Revenue",
          ]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
