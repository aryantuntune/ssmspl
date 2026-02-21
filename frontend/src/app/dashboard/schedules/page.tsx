"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Branch, FerrySchedule, FerryScheduleCreate, FerryScheduleUpdate } from "@/types";

interface ScheduleFormData {
  branch_id: string;
  departure: string;
}

const emptyForm: ScheduleFormData = { branch_id: "", departure: "" };
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<FerrySchedule[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  // Pagination, sorting & filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [branchFilter, setBranchFilter] = useState("");
  const [idInput, setIdInput] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [idEndInput, setIdEndInput] = useState("");
  const [idFilterEnd, setIdFilterEnd] = useState("");
  const [idOp, setIdOp] = useState("eq");
  const idDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idEndDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<FerrySchedule | null>(null);
  const [form, setForm] = useState<ScheduleFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // View modal state
  const [viewSchedule, setViewSchedule] = useState<FerrySchedule | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      const resp = await api.get<Branch[]>("/api/branches/?skip=0&limit=200&status=active&sort_by=name&sort_order=asc");
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
      if (idFilter) {
        params.set("id_filter", idFilter);
        params.set("id_op", idOp);
        if (idOp === "between" && idFilterEnd) params.set("id_filter_end", idFilterEnd);
      }

      const filterKeys = ["branch_filter", "id_filter", "id_op", "id_filter_end"];
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
  }, [page, pageSize, sortBy, sortOrder, branchFilter, idFilter, idOp, idFilterEnd]);

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
        if (branchId !== editingSchedule.branch_id) update.branch_id = branchId;
        if (form.departure !== editingSchedule.departure) update.departure = form.departure;
        await api.patch(`/api/ferry-schedules/${editingSchedule.id}`, update);
      } else {
        const create: FerryScheduleCreate = { branch_id: branchId, departure: form.departure };
        await api.post("/api/ferry-schedules/", create);
      }
      closeModal();
      await fetchSchedules();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Operation failed. Please try again.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Pagination computed values
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const sortIndicator = (column: string) => {
    if (sortBy !== column) return "";
    return sortOrder === "asc" ? " \u25B2" : " \u25BC";
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Schedule Management</h2>
          <p className="text-gray-500 text-sm mt-1">
            Manage ferry departure schedules by branch
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg transition"
        >
          + Add Schedule
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* ID filter operator */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">ID</label>
          <div className="flex">
            <select
              value={idOp}
              onChange={(e) => {
                const op = e.target.value;
                setIdOp(op);
                if (op !== "between") { setIdEndInput(""); setIdFilterEnd(""); }
                setPage(1);
              }}
              className="border border-gray-300 rounded-l-lg px-2 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            >
              <option value="eq">=</option>
              <option value="lt">&lt;</option>
              <option value="gt">&gt;</option>
              <option value="between">Between</option>
            </select>
            <input
              type="number"
              min="1"
              placeholder={idOp === "between" ? "From" : "ID"}
              value={idInput}
              onChange={(e) => {
                const val = e.target.value;
                setIdInput(val);
                if (idDebounceRef.current) clearTimeout(idDebounceRef.current);
                idDebounceRef.current = setTimeout(() => { setIdFilter(val); setPage(1); }, 400);
              }}
              className={`w-20 border border-l-0 border-gray-300 px-2 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${idOp !== "between" ? "rounded-r-lg" : ""}`}
            />
            {idOp === "between" && (
              <>
                <span className="flex items-center px-1.5 border-y border-gray-300 bg-gray-50 text-gray-400 text-xs">&ndash;</span>
                <input
                  type="number"
                  min="1"
                  placeholder="To"
                  value={idEndInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIdEndInput(val);
                    if (idEndDebounceRef.current) clearTimeout(idEndDebounceRef.current);
                    idEndDebounceRef.current = setTimeout(() => { setIdFilterEnd(val); setPage(1); }, 400);
                  }}
                  className="w-20 border border-l-0 border-gray-300 rounded-r-lg px-2 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </>
            )}
          </div>
        </div>

        {/* Branch filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Clear filters */}
        {(branchFilter || idInput || idEndInput || idOp !== "eq") && (
          <button
            onClick={() => {
              setBranchFilter(""); setIdInput(""); setIdFilter("");
              setIdEndInput(""); setIdFilterEnd(""); setIdOp("eq");
              setPage(1);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Schedules Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th onClick={() => handleSort("id")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">ID{sortIndicator("id")}</th>
              <th onClick={() => handleSort("branch_id")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Branch{sortIndicator("branch_id")}</th>
              <th onClick={() => handleSort("departure")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Departure{sortIndicator("departure")}</th>
              <th className="text-right px-6 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  Loading schedules...
                </td>
              </tr>
            ) : schedules.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  No schedules found. Click &quot;+ Add Schedule&quot; to create one.
                </td>
              </tr>
            ) : (
              schedules.map((schedule) => (
                <tr
                  key={schedule.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4 text-gray-500">{schedule.id}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">{schedule.branch_name ?? schedule.branch_id}</td>
                  <td className="px-6 py-4 text-gray-800">{schedule.departure}</td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => setViewSchedule(schedule)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEditModal(schedule)}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm transition"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-2 py-1 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span>
            {totalCount === 0
              ? "No records"
              : `${(page - 1) * pageSize + 1}\u2013${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
          </span>
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="First page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L11.832 10l3.938 3.71a.75.75 0 01.02 1.06zm-6 0a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L5.832 10l3.938 3.71a.75.75 0 01.02 1.06z" clipRule="evenodd" /></svg>
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M12.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L8.832 10l3.938 3.71a.75.75 0 01.02 1.06z" clipRule="evenodd" /></svg>
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Last page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.21 14.77a.75.75 0 01.02-1.06L8.168 10 4.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02zm6 0a.75.75 0 01.02-1.06L14.168 10 10.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      {/* View Modal */}
      {viewSchedule && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Schedule Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">ID</span>
                <span className="text-sm text-gray-800">{viewSchedule.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Branch</span>
                <span className="text-sm text-gray-800">{viewSchedule.branch_name ?? viewSchedule.branch_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Departure</span>
                <span className="text-sm text-gray-800">{viewSchedule.departure}</span>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setViewSchedule(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {editingSchedule ? "Edit Schedule" : "Add New Schedule"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch *
                </label>
                <select
                  required
                  value={form.branch_id}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Departure Time *
                </label>
                <input
                  type="time"
                  required
                  value={form.departure}
                  onChange={(e) => setForm({ ...form, departure: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60"
                >
                  {submitting
                    ? "Saving..."
                    : editingSchedule
                      ? "Update Schedule"
                      : "Create Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
