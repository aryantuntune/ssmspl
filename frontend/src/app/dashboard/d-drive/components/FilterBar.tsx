"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { PaymentMode } from "@/types";

export interface Filters {
  dateStart: string;
  dateEnd: string;
  branchId: string;
  paymentMode: string;
  itemId: string;
}

interface Props {
  branches: { id: number; name: string }[];
  items: { id: number; name: string }[];
  onApply: (f: Filters) => void;
}

export default function FilterBar({ branches, items, onApply }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [dateStart, setDateStart] = useState(today);
  const [dateEnd, setDateEnd] = useState(today);
  const [branchId, setBranchId] = useState("all");
  const [paymentMode, setPaymentMode] = useState("all");
  const [itemId, setItemId] = useState("all");
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);

  // D-Drive filter shows ALL modes (including Online) so admins can filter
  // portal-originated tickets too. The d-drive list is a reconciliation view,
  // not a POS entry form.
  useEffect(() => {
    api.get<PaymentMode[]>("/api/payment-modes?limit=200&status=active")
      .then(r => setPaymentModes(r.data))
      .catch(() => setPaymentModes([]));
  }, []);

  return (
    <div className="flex flex-wrap gap-4 items-end p-4 bg-card border rounded-lg">
      <div className="flex flex-col gap-1.5">
        <Label>From</Label>
        <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-36" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>To</Label>
        <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-36" />
      </div>
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
      <div className="flex flex-col gap-1.5">
        <Label>Payment Mode</Label>
        <Select value={paymentMode} onValueChange={setPaymentMode}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            {paymentModes.map(pm => (
              <SelectItem key={pm.id} value={pm.description.toUpperCase()}>
                {pm.description}
              </SelectItem>
            ))}
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
      <Button onClick={() => onApply({ dateStart, dateEnd, branchId, paymentMode, itemId })}>
        Apply Filters
      </Button>
    </div>
  );
}
