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
  itemId: string;
}

interface Props {
  mode: "reconcile" | "transfer";
  branches: { id: number; name: string }[];
  routes: RouteOption[];
  onApply: (f: Filters) => void;
}

export const formatRouteLabel = (r: RouteOption) =>
  `${r.branch_one_name ?? "Branch " + r.branch_id_one} ↔ ${r.branch_two_name ?? "Branch " + r.branch_id_two}`;

export default function FilterBar({ mode, branches, routes, onApply }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [dateEnd, setDateEnd] = useState(today);
  const [rangeMode, setRangeMode] = useState(false);
  const [branchId, setBranchId] = useState<string>("all");
  const [routeId, setRouteId] = useState<string>("all");

  const handleApply = () => {
    onApply({
      dateStart: date,
      dateEnd: rangeMode ? dateEnd : date,
      scopeMode: mode === "transfer" ? "route" : "branch",
      branchId,
      routeId,
      itemId: "all",
    });
  };

  const enableRange = () => {
    if (dateEnd < date) setDateEnd(date);
    setRangeMode(true);
  };

  const disableRange = () => {
    setRangeMode(false);
    setDateEnd(date);
  };

  const applyDisabled = mode === "transfer" && routeId === "all";

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

      {mode === "reconcile" ? (
        <div className="flex flex-col gap-1.5">
          <Label>Branch</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
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
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select a route…" />
            </SelectTrigger>
            <SelectContent>
              {routes.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{formatRouteLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button onClick={handleApply} disabled={applyDisabled}>
        Apply Filters
      </Button>
    </div>
  );
}
