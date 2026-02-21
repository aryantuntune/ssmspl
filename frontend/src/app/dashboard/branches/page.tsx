"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Branch, BranchCreate, BranchUpdate } from "@/types";

interface BranchFormData {
  name: string;
  address: string;
  contact_nos: string;
  latitude: string;
  longitude: string;
  sf_after: string;
  sf_before: string;
  is_active: boolean;
}

const emptyForm: BranchFormData = { name: "", address: "", contact_nos: "", latitude: "", longitude: "", sf_after: "", sf_before: "", is_active: true };
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

export default function BranchesPage() {
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
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchColumn, setSearchColumn] = useState("all");
  const [matchType, setMatchType] = useState("contains");
  const [idInput, setIdInput] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [idEndInput, setIdEndInput] = useState("");
  const [idFilterEnd, setIdFilterEnd] = useState("");
  const [idOp, setIdOp] = useState("eq");
  const [statusFilter, setStatusFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idEndDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // View modal state
  const [viewBranch, setViewBranch] = useState<Branch | null>(null);

  const fetchBranches = useCallback(async () => {
    setTableLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(pageSize),
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (search.trim()) {
        params.set("search", search.trim());
        params.set("search_column", searchColumn);
        params.set("match_type", matchType);
      }
      if (idFilter) {
        params.set("id_filter", idFilter);
        params.set("id_op", idOp);
        if (idOp === "between" && idFilterEnd) params.set("id_filter_end", idFilterEnd);
      }
      if (statusFilter) params.set("status", statusFilter);

      const filterKeys = ["search", "search_column", "match_type", "id_filter", "id_op", "id_filter_end", "status"];
      const countParams = new URLSearchParams(
        Object.fromEntries([...params].filter(([k]) => filterKeys.includes(k)))
      );

      const [pageResp, countResp] = await Promise.all([
        api.get<Branch[]>(`/api/branches/?${params}`),
        api.get<number>(`/api/branches/count?${countParams}`),
      ]);
      setBranches(pageResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load branches.");
    } finally {
      setTableLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, search, searchColumn, matchType, idFilter, idOp, idFilterEnd, statusFilter]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const openCreateModal = () => {
    setEditingBranch(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      address: branch.address,
      contact_nos: branch.contact_nos ?? "",
      latitude: branch.latitude != null ? String(branch.latitude) : "",
      longitude: branch.longitude != null ? String(branch.longitude) : "",
      sf_after: branch.sf_after ?? "",
      sf_before: branch.sf_before ?? "",
      is_active: branch.is_active ?? true,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBranch(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      if (editingBranch) {
        const update: BranchUpdate = {};
        if (form.name !== editingBranch.name) update.name = form.name;
        if (form.address !== editingBranch.address) update.address = form.address;
        const formContactNos = form.contact_nos || undefined;
        const editContactNos = editingBranch.contact_nos || undefined;
        if (formContactNos !== editContactNos) update.contact_nos = form.contact_nos || undefined;
        const formLat = form.latitude ? parseFloat(form.latitude) : undefined;
        const editLat = editingBranch.latitude ?? undefined;
        if (formLat !== editLat) update.latitude = formLat;
        const formLng = form.longitude ? parseFloat(form.longitude) : undefined;
        const editLng = editingBranch.longitude ?? undefined;
        if (formLng !== editLng) update.longitude = formLng;
        const formSfAfter = form.sf_after || null;
        const editSfAfter = editingBranch.sf_after || null;
        if (formSfAfter !== editSfAfter) update.sf_after = formSfAfter;
        const formSfBefore = form.sf_before || null;
        const editSfBefore = editingBranch.sf_before || null;
        if (formSfBefore !== editSfBefore) update.sf_before = formSfBefore;
        if (form.is_active !== (editingBranch.is_active ?? true))
          update.is_active = form.is_active;
        await api.patch(`/api/branches/${editingBranch.id}`, update);
      } else {
        const create: BranchCreate = { name: form.name, address: form.address };
        if (form.contact_nos) create.contact_nos = form.contact_nos;
        if (form.latitude) create.latitude = parseFloat(form.latitude);
        if (form.longitude) create.longitude = parseFloat(form.longitude);
        if (form.sf_after) create.sf_after = form.sf_after;
        if (form.sf_before) create.sf_before = form.sf_before;
        await api.post("/api/branches/", create);
      }
      closeModal();
      await fetchBranches();
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

  // --- Export helpers ---

  const fetchAllBranches = async (): Promise<Branch[]> => {
    const params = new URLSearchParams({
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    if (search.trim()) {
      params.set("search", search.trim());
      params.set("search_column", searchColumn);
      params.set("match_type", matchType);
    }
    if (idFilter) {
      params.set("id_filter", idFilter);
      params.set("id_op", idOp);
      if (idOp === "between" && idFilterEnd) params.set("id_filter_end", idFilterEnd);
    }
    if (statusFilter) params.set("status", statusFilter);
    const resp = await api.get<Branch[]>(`/api/branches/export?${params}`);
    return resp.data;
  };

  const formatRows = (data: Branch[]) =>
    data.map((b) => [
      b.id,
      b.name,
      b.address,
      b.contact_nos ?? "\u2014",
      b.is_active ? "Active" : "Inactive",
    ]);

  const EXPORT_HEADERS = ["ID", "Name", "Address", "Contact Nos", "Status"];

  const handlePrint = async () => {
    try {
      const data = await fetchAllBranches();
      const rows = formatRows(data);
      const html = `<!DOCTYPE html>
<html><head><title>SSMSPL - Branch List</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
  h1 { font-size: 18px; margin: 0; }
  .sub { font-size: 12px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f3f4f6; text-align: left; padding: 8px 12px; border: 1px solid #d1d5db; font-weight: 600; }
  td { padding: 8px 12px; border: 1px solid #d1d5db; }
  tr:nth-child(even) { background: #f9fafb; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>SSMSPL - Branch List</h1>
<div class="sub">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} &bull; ${data.length} record(s)</div>
<table><thead><tr>${EXPORT_HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>
</body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    } catch {
      setError("Failed to fetch data for printing.");
    }
  };

  const handleExportPDF = async () => {
    try {
      const data = await fetchAllBranches();
      const rows = formatRows(data);
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(16);
      doc.text("SSMSPL - Branch List", 14, 15);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(
        `${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}  |  ${data.length} record(s)`,
        14,
        22,
      );
      autoTable(doc, {
        startY: 28,
        head: [EXPORT_HEADERS],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 64, 175] },
      });
      doc.save("branches.pdf");
    } catch {
      setError("Failed to generate PDF.");
    }
  };

  const handleExportExcel = async () => {
    try {
      const data = await fetchAllBranches();
      const rows = formatRows(data);
      const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows]);
      ws["!cols"] = [{ wch: 5 }, { wch: 15 }, { wch: 35 }, { wch: 20 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Branches");
      XLSX.writeFile(wb, "branches.xlsx");
    } catch {
      setError("Failed to generate Excel file.");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Branch Management</h2>
          <p className="text-gray-500 text-sm mt-1">
            Manage branches and jetty locations in the system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="border border-gray-300 hover:bg-gray-100 text-gray-700 font-medium px-3 py-2.5 rounded-lg transition text-sm flex items-center gap-1.5"
            title="Print branch list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" /></svg>
            Print
          </button>
          <button
            onClick={handleExportPDF}
            className="border border-gray-300 hover:bg-gray-100 text-gray-700 font-medium px-3 py-2.5 rounded-lg transition text-sm flex items-center gap-1.5"
            title="Download as PDF"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" /></svg>
            PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="border border-gray-300 hover:bg-gray-100 text-gray-700 font-medium px-3 py-2.5 rounded-lg transition text-sm flex items-center gap-1.5"
            title="Download as Excel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M1 4.75C1 3.784 1.784 3 2.75 3h14.5c.966 0 1.75.784 1.75 1.75v10.515a1.75 1.75 0 01-1.75 1.75H2.75A1.75 1.75 0 011 15.265V4.75zm3.5 0v2.5h4v-2.5h-4zm0 4v2.5h4v-2.5h-4zm0 4v2.515h4V12.75h-4zm5.5 2.515h4V12.75h-4v2.515zm4-4.015h-4v-2.5h4v2.5zm0-4h-4v-2.5h4v2.5z" clipRule="evenodd" /></svg>
            Excel
          </button>
          <button
            onClick={openCreateModal}
            className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg transition"
          >
            + Add Branch
          </button>
        </div>
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

          {/* Search column */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Search in</label>
            <select
              value={searchColumn}
              onChange={(e) => { setSearchColumn(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Fields</option>
              <option value="name">Name</option>
              <option value="address">Address</option>
              <option value="contact_nos">Contact Nos</option>
            </select>
          </div>

          {/* Match type */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Match</label>
            <select
              value={matchType}
              onChange={(e) => { setMatchType(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="contains">Contains</option>
              <option value="starts_with">Starts with</option>
              <option value="ends_with">Ends with</option>
            </select>
          </div>

          {/* Search input */}
          <div className="relative flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                placeholder={
                  searchColumn === "name" ? "Search by name..." :
                  searchColumn === "address" ? "Search by address..." :
                  searchColumn === "contact_nos" ? "Search by contact..." :
                  "Search by name, address, or contact..."
                }
                value={searchInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchInput(val);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => { setSearch(val); setPage(1); }, 400);
                }}
                className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Clear filters */}
          {(searchInput || statusFilter || searchColumn !== "all" || matchType !== "contains" || idInput || idEndInput || idOp !== "eq") && (
            <button
              onClick={() => {
                setSearchInput(""); setSearch(""); setSearchColumn("all");
                setMatchType("contains"); setIdInput(""); setIdFilter("");
                setIdEndInput(""); setIdFilterEnd(""); setIdOp("eq");
                setStatusFilter(""); setPage(1);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 underline pb-2"
            >
              Clear filters
            </button>
          )}
      </div>

      {/* Branches Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th onClick={() => handleSort("id")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">ID{sortIndicator("id")}</th>
              <th onClick={() => handleSort("name")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Name{sortIndicator("name")}</th>
              <th onClick={() => handleSort("address")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Address{sortIndicator("address")}</th>
              <th onClick={() => handleSort("contact_nos")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Contact Nos{sortIndicator("contact_nos")}</th>
              <th onClick={() => handleSort("is_active")} className="text-left px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-700">Status{sortIndicator("is_active")}</th>
              <th className="text-right px-6 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  Loading branches...
                </td>
              </tr>
            ) : branches.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  No branches found. Click &quot;+ Add Branch&quot; to create one.
                </td>
              </tr>
            ) : (
              branches.map((branch) => (
                <tr
                  key={branch.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4 text-gray-500">{branch.id}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">{branch.name}</td>
                  <td className="px-6 py-4 text-gray-600">{branch.address}</td>
                  <td className="px-6 py-4 text-gray-600">{branch.contact_nos ?? "\u2014"}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                        branch.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {branch.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => setViewBranch(branch)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEditModal(branch)}
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

      {/* View Modal (read-only popup) */}
      {viewBranch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Branch Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">ID</span>
                <span className="text-sm text-gray-800">{viewBranch.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Name</span>
                <span className="text-sm text-gray-800">{viewBranch.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Address</span>
                <span className="text-sm text-gray-800 text-right max-w-[60%]">{viewBranch.address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Contact Nos</span>
                <span className="text-sm text-gray-800">{viewBranch.contact_nos ?? "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Latitude</span>
                <span className="text-sm text-gray-800">{viewBranch.latitude != null ? viewBranch.latitude : "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Longitude</span>
                <span className="text-sm text-gray-800">{viewBranch.longitude != null ? viewBranch.longitude : "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">SF After</span>
                <span className="text-sm text-gray-800">{viewBranch.sf_after ?? "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">SF Before</span>
                <span className="text-sm text-gray-800">{viewBranch.sf_before ?? "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Status</span>
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                    viewBranch.is_active
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {viewBranch.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setViewBranch(null)}
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
              {editingBranch ? "Edit Branch" : "Add New Branch"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={15}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Old Goa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address *
                </label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Old Goa Jetty, Goa 403402"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Numbers
                </label>
                <input
                  type="text"
                  maxLength={255}
                  value={form.contact_nos}
                  onChange={(e) => setForm({ ...form, contact_nos: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 0832-2456789"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 15.50133"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 73.91109"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SF After
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={form.sf_after}
                    onChange={(e) => setForm({ ...form, sf_after: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SF Before
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={form.sf_before}
                    onChange={(e) => setForm({ ...form, sf_before: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Status toggle - only shown when editing */}
              {editingBranch && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <p className="text-xs text-gray-400">
                      Inactive branches are soft-deleted and hidden from normal operations
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      form.is_active ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        form.is_active ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}

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
                    : editingBranch
                      ? "Update Branch"
                      : "Create Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
