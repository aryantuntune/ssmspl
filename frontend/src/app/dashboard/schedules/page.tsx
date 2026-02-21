"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Branch,
  FerrySchedule,
  FerryScheduleCreate,
  FerryScheduleUpdate,
} from "@/types";
import DataTable, { Column } from "@/components/dashboard/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface ScheduleFormData {
  branch_id: string;
  departure: string;
}

const emptyForm: ScheduleFormData = { branch_id: "", departure: "" };

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<FerrySchedule[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  // Pagination, sorting & filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [branchFilter, setBranchFilter] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<FerrySchedule | null>(
    null
  );
  const [form, setForm] = useState<ScheduleFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // View modal state
  const [viewSchedule, setViewSchedule] = useState<FerrySchedule | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      const resp = await api.get<Branch[]>(
        "/api/branches/?skip=0&limit=200&status=active&sort_by=name&sort_order=asc"
      );
      setBranches(resp.data);
    } catch {
      // branches dropdown will be empty
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    setTableLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(pageSize),
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (branchFilter) params.set("branch_filter", branchFilter);

      const filterKeys = ["branch_filter"];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<FerrySchedule[]>(`/api/ferry-schedules/?${params}`),
        api.get<number>(`/api/ferry-schedules/count?${countParams}`),
      ]);
      setSchedules(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load schedules.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, branchFilter]);

  useEffect(() => {
    fetchSchedules();
    fetchBranches();
  }, [fetchSchedules, fetchBranches]);

  const openCreateModal = () => {
    setEditingSchedule(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (schedule: FerrySchedule) => {
    setEditingSchedule(schedule);
    setForm({
      branch_id: String(schedule.branch_id),
      departure: schedule.departure,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSchedule(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const branchId = parseInt(form.branch_id);
    if (!branchId) {
      setFormError("Please select a branch.");
      return;
    }
    if (!form.departure) {
      setFormError("Please select a departure time.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingSchedule) {
        const update: FerryScheduleUpdate = {};
        if (branchId !== editingSchedule.branch_id)
          update.branch_id = branchId;
        if (form.departure !== editingSchedule.departure)
          update.departure = form.departure;
        await api.patch(
          `/api/ferry-schedules/${editingSchedule.id}`,
          update
        );
      } else {
        const create: FerryScheduleCreate = {
          branch_id: branchId,
          departure: form.departure,
        };
        await api.post("/api/ferry-schedules/", create);
      }
      closeModal();
      await fetchSchedules();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Operation failed. Please try again.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const columns: Column<FerrySchedule>[] = [
    {
      key: "id",
      label: "ID",
      sortable: true,
      render: (s) => <span className="text-muted-foreground">{s.id}</span>,
    },
    {
      key: "branch_id",
      label: "Branch",
      sortable: true,
      render: (s) => (
        <span className="font-medium">
          {s.branch_name ?? s.branch_id}
        </span>
      ),
    },
    {
      key: "departure",
      label: "Departure",
      sortable: true,
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (s) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewSchedule(s)}
          >
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(s)}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage ferry departure schedules by branch
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" /> Add Schedule
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1.5 block">Branch</Label>
              <Select
                value={branchFilter || "all"}
                onValueChange={(v) => {
                  setBranchFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {branchFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBranchFilter("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={schedules}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSort={handleSort}
        loading={tableLoading}
        emptyMessage='No schedules found. Click "Add Schedule" to create one.'
      />

      {/* View Modal */}
      <Dialog
        open={!!viewSchedule}
        onOpenChange={(open) => !open && setViewSchedule(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Details</DialogTitle>
          </DialogHeader>
          {viewSchedule && (
            <div className="space-y-3">
              {(
                [
                  ["ID", viewSchedule.id],
                  [
                    "Branch",
                    viewSchedule.branch_name ?? viewSchedule.branch_id,
                  ],
                  ["Departure", viewSchedule.departure],
                ] as [string, React.ReactNode][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between items-center"
                >
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewSchedule(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? "Edit Schedule" : "Add New Schedule"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Branch *</Label>
              <Select
                value={form.branch_id || "placeholder"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    branch_id: v === "placeholder" ? "" : v,
                  })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>
                    Select a branch
                  </SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Departure Time *</Label>
              <Input
                type="time"
                required
                value={form.departure}
                onChange={(e) =>
                  setForm({ ...form, departure: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Saving..."
                  : editingSchedule
                    ? "Update Schedule"
                    : "Create Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
