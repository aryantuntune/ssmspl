"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CalendarPlus, X } from "lucide-react";

export type ScopeMode = "branch" | "route";

export interface RouteOption {
  id: number;
  branch_one_name: string | null;
  branch_two_name: string | null;
  branch_id_one: number;
  branch_id_two: number;
}

export interface Filters {
  dateStart: string;
  dateEnd: string;
  scopeMode: ScopeMode;
  branchId: string;
  routeId: string;
  paymentMode: string;
  itemId: string;
}

interface Props {
  branches: { id: number; name: string }[];
  items: { id: number; name: string }[];
  routes: RouteOption[];
  onApply: (f: Filters) => void;
}

export const formatRouteLabel = (r: RouteOption) =>
  `${r.branch_one_name ?? "Branch " + r.branch_id_one} ↔ ${r.branch_two_name ?? "Branch " + r.branch_id_two}`;

export default function FilterBar({ branches, items, routes, onApply }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [dateEnd, setDateEnd] = useState(today);
  const [rangeMode, setRangeMode] = useState(false);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("branch");
  const [branchId, setBranchId] = useState("all");
  const [routeId, setRouteId] = useState("all");
  const [paymentMode, setPaymentMode] = useState("all");
  const [itemId, setItemId] = useState("all");

  const handleApply = () => {
    onApply({
      dateStart: date,
      dateEnd: rangeMode ? dateEnd : date,
      scopeMode,
      branchId,
      routeId,
      paymentMode,
      itemId,
    });
  };

  const enableRange = () => {
    // When opening range, seed end date to current single date if it's earlier
    if (dateEnd < date) setDateEnd(date);
    setRangeMode(true);
  };

  const disableRange = () => {
    setRangeMode(false);
    setDateEnd(date);
  };

  return (
    <div className="flex flex-wrap gap-4 items-end p-4 bg-card border rounded-lg">
      <div className="flex flex-col gap-1.5">
        <Label>{rangeMode ? "From" : "Date"}</Label>
        <Input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-36"
        />
      </div>
      {rangeMode ? (
        <div className="flex flex-col gap-1.5">
          <Label>To</Label>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateEnd}
              min={date}
              onChange={e => setDateEnd(e.target.value)}
              className="w-36"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={disableRange}
              title="Remove range"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label className="invisible">Range</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={enableRange}
          >
            <CalendarPlus className="w-4 h-4 mr-1.5" /> Add range
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Scope</Label>
        <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as ScopeMode)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="branch">Branch</SelectItem>
            <SelectItem value="route">Route</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {scopeMode === "branch" ? (
        <div className="flex flex-col gap-1.5">
          <Label>Branch</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>Route</Label>
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select a route…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Routes</SelectItem>
              {routes.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{formatRouteLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Payment Mode</Label>
        <Select value={paymentMode} onValueChange={setPaymentMode}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="UPI">UPI</SelectItem>
            <SelectItem value="ONLINE">Online</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Item</Label>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            {items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleApply}>
        Apply Filters
      </Button>
    </div>
  );
}
