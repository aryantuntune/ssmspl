"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DataTable, { Column } from "@/components/dashboard/DataTable";
import type {
  ActiveSession,
  SessionHistory,
  SessionUser,
  SessionActivitySummary,
} from "@/types/user-session";

/* ───── helpers ───── */

function formatDuration(
  startIso: string | null,
  endIso?: string | null
): string {
  if (!startIso) return "\u2014";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diffMs = end - start;
  if (diffMs < 0) return "\u2014";
  const mins = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remainMins}m`;
  return `${remainMins}m`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function portalBadge(portal: string | null) {
  if (portal === "admin") {
    return (
      <Badge className="bg-blue-600 hover:bg-blue-600 text-white">
        Admin Portal
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-gray-700">
      Main Site
    </Badge>
  );
}

function roleBadge(role: string) {
  const colors: Record<
    string,
    "default" | "secondary" | "outline" | "destructive"
  > = {
    SUPER_ADMIN: "destructive",
    ADMIN: "default",
    MANAGER: "secondary",
    BILLING_OPERATOR: "outline",
    TICKET_CHECKER: "outline",
  };
  return (
    <Badge variant={colors[role] || "secondary"}>
      {role === "SUPER_ADMIN" ? "System Administrator" : role.replace(/_/g, " ")}
    </Badge>
  );
}

function endReasonBadge(reason: string | null) {
  if (!reason)
    return (
      <Badge variant="default" className="bg-green-600">
        Active
      </Badge>
    );
  const map: Record<
    string,
    { variant: "default" | "secondary" | "destructive"; label: string }
  > = {
    logout: { variant: "default", label: "Logout" },
    timeout: { variant: "secondary", label: "Idle Timeout" },
    login_elsewhere: { variant: "destructive", label: "Kicked" },
    idle_timeout: { variant: "secondary", label: "Idle Timeout" },
    password_reset: { variant: "destructive", label: "Password Reset" },
  };
  const info = map[reason] || {
    variant: "secondary" as const,
    label: reason,
  };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

const ACTION_LABELS: Record<string, string> = {
  TICKET_CREATE: "Tickets Created",
  TICKET_BATCH: "Batch Tickets",
  TICKET_VIEW: "Tickets Viewed",
  TICKET_CANCEL: "Tickets Cancelled",
  REPORT_VIEW: "Reports Viewed",
  REPORT_PDF: "PDFs Downloaded",
  SETTINGS_CHANGE: "Settings Changed",
  BRANCH_SWITCH: "Branch Switches",
};

/* ───── Activity detail inline panel ───── */

function ActivityDetail({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<SessionActivitySummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<SessionActivitySummary[]>(
        `/api/user-sessions/${sessionId}/activities`
      )
      .then((r) => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading)
    return (
      <span className="text-xs text-gray-400 italic">Loading...</span>
    );
  if (!data || data.length === 0)
    return (
      <span className="text-xs text-gray-400 italic">No activity logged</span>
    );

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
      {data.map((a) => (
        <span key={a.action_type} className="text-xs text-gray-600">
          <span className="font-medium">{a.count}</span>{" "}
          {ACTION_LABELS[a.action_type] || a.action_type}
        </span>
      ))}
    </div>
  );
}

/* ───── shared column builders ───── */

function branchColumn<T extends ActiveSession>(): Column<T> {
  return {
    key: "branch_name" as string,
    label: "Branch",
    render: (s) =>
      s.branch_name ? (
        <span className="text-sm">{s.branch_name}</span>
      ) : (
        <span className="text-gray-300">{"\u2014"}</span>
      ),
  };
}

function ipCityColumn<T extends ActiveSession>(): Column<T> {
  return {
    key: "ip_address" as string,
    label: "IP / City",
    render: (s) => (
      <div className="text-sm">
        <div>{s.ip_address || "\u2014"}</div>
        {s.city && <div className="text-xs text-gray-400">{s.city}</div>}
        {s.isp && (
          <div className="text-[10px] text-gray-300 truncate max-w-[180px]">
            {s.isp}
          </div>
        )}
      </div>
    ),
  };
}

function ticketsColumn<T extends ActiveSession>(
  expandedId: string | null,
  setExpandedId: (id: string | null) => void
): Column<T> {
  return {
    key: "ticket_count" as string,
    label: "Tickets / Activity",
    render: (s) => {
      const isExpanded = expandedId === s.session_id;
      return (
        <div>
          <div className="flex items-center gap-2">
            {s.ticket_count !== null && s.ticket_count !== undefined ? (
              <span className="font-medium">{s.ticket_count}</span>
            ) : (
              <span className="text-gray-300">{"\u2014"}</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedId(isExpanded ? null : s.session_id);
              }}
              className="text-[11px] text-blue-500 hover:text-blue-700 hover:underline"
            >
              {isExpanded ? "hide" : "details"}
            </button>
          </div>
          {isExpanded && <ActivityDetail sessionId={s.session_id} />}
        </div>
      );
    },
  };
}

/* ───── page ───── */

export default function UserSessionsPage() {
  const [tab, setTab] = useState<"live" | "history">("live");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Sessions</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b pb-0">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
            tab === "live"
              ? "bg-white border border-b-white -mb-px text-blue-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("live")}
        >
          Live Sessions
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
            tab === "history"
              ? "bg-white border border-b-white -mb-px text-blue-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("history")}
        >
          Session History
        </button>
      </div>

      {tab === "live" ? <LiveSessions /> : <HistoryTab />}
    </div>
  );
}

/* ───── Live Sessions Tab ───── */

function LiveSessions() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [portalFilter, setPortalFilter] = useState<"all" | "admin" | "main">("all");

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get<ActiveSession[]>(
        "/api/user-sessions/active"
      );
      setSessions(resp.data);
      setError("");
    } catch {
      setError("Failed to load active sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const filteredSessions = sessions.filter((s) => {
    if (portalFilter === "all") return true;
    if (portalFilter === "admin") return s.portal === "admin";
    return s.portal !== "admin";
  });

  const adminCount = sessions.filter((s) => s.portal === "admin").length;
  const mainCount = sessions.length - adminCount;

  const columns: Column<ActiveSession>[] = [
    {
      key: "full_name",
      label: "User",
      render: (s) => (
        <div>
          <span className="font-medium">{s.full_name}</span>
          <span className="text-xs text-gray-400 ml-2">@{s.username}</span>
        </div>
      ),
    },
    {
      key: "portal" as keyof ActiveSession,
      label: "Portal",
      render: (s) => portalBadge(s.portal),
    },
    {
      key: "role",
      label: "Role",
      render: (s) => roleBadge(s.role),
    },
    branchColumn<ActiveSession>(),
    ipCityColumn<ActiveSession>(),
    {
      key: "started_at",
      label: "Login Time",
      render: (s) => (
        <span className="text-sm">{formatTime(s.started_at)}</span>
      ),
    },
    {
      key: "last_heartbeat" as keyof ActiveSession,
      label: "Duration",
      render: (s) => (
        <span className="text-sm font-mono">
          {formatDuration(s.started_at)}
        </span>
      ),
    },
    ticketsColumn<ActiveSession>(expandedId, setExpandedId),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-gray-500 mr-2">
            {filteredSessions.length} of {sessions.length} active session
            {sessions.length !== 1 ? "s" : ""}
          </p>
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button
              onClick={() => setPortalFilter("all")}
              className={`px-3 py-1.5 transition ${
                portalFilter === "all"
                  ? "bg-gray-800 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              All ({sessions.length})
            </button>
            <button
              onClick={() => setPortalFilter("admin")}
              className={`px-3 py-1.5 border-l transition ${
                portalFilter === "admin"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Admin Portal ({adminCount})
            </button>
            <button
              onClick={() => setPortalFilter("main")}
              className={`px-3 py-1.5 border-l transition ${
                portalFilter === "main"
                  ? "bg-gray-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Main Site ({mainCount})
            </button>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSessions}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <DataTable
        columns={columns}
        data={filteredSessions}
        totalCount={filteredSessions.length}
        page={1}
        pageSize={filteredSessions.length || 10}
        sortBy=""
        sortOrder="asc"
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        onSort={() => {}}
        loading={loading}
        emptyMessage="No active sessions."
      />
    </div>
  );
}

/* ───── History Tab ───── */

function HistoryTab() {
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load user list for filter dropdown
  useEffect(() => {
    api
      .get<SessionUser[]>("/api/user-sessions/users")
      .then((r) => setUsers(r.data))
      .catch(() => setError("Failed to load user list for filters."));
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: String((page - 1) * pageSize),
        limit: String(pageSize),
      });
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (userFilter) params.set("user_id", userFilter);

      const countParams = new URLSearchParams();
      if (dateFrom) countParams.set("date_from", dateFrom);
      if (dateTo) countParams.set("date_to", dateTo);
      if (userFilter) countParams.set("user_id", userFilter);

      const [dataResp, countResp] = await Promise.all([
        api.get<SessionHistory[]>(
          `/api/user-sessions/history?${params}`
        ),
        api.get<number>(
          `/api/user-sessions/history/count?${countParams}`
        ),
      ]);
      setSessions(dataResp.data);
      setTotalCount(countResp.data as unknown as number);
      setError("");
    } catch {
      setError("Failed to load session history.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, dateFrom, dateTo, userFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const columns: Column<SessionHistory>[] = [
    {
      key: "full_name",
      label: "User",
      render: (s) => (
        <div>
          <span className="font-medium">{s.full_name}</span>
          <span className="text-xs text-gray-400 ml-2">@{s.username}</span>
        </div>
      ),
    },
    {
      key: "portal" as keyof SessionHistory,
      label: "Portal",
      render: (s) => portalBadge(s.portal),
    },
    {
      key: "role",
      label: "Role",
      render: (s) => roleBadge(s.role),
    },
    branchColumn<SessionHistory>(),
    {
      key: "started_at",
      label: "Login",
      render: (s) => (
        <span className="text-sm">{formatTime(s.started_at)}</span>
      ),
    },
    {
      key: "ended_at",
      label: "Logout",
      render: (s) => (
        <span className="text-sm">{formatTime(s.ended_at)}</span>
      ),
    },
    {
      key: "last_heartbeat" as keyof SessionHistory,
      label: "Duration",
      render: (s) => (
        <span className="text-sm font-mono">
          {formatDuration(s.started_at, s.ended_at)}
        </span>
      ),
    },
    {
      key: "end_reason",
      label: "End Reason",
      render: (s) => endReasonBadge(s.end_reason),
    },
    ipCityColumn<SessionHistory>(),
    ticketsColumn<SessionHistory>(expandedId, setExpandedId),
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="border rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="border rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">User</label>
          <select
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              setPage(1);
            }}
            className="border rounded-md px-3 py-1.5 text-sm min-w-[180px]"
          >
            <option value="">All Users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role === "SUPER_ADMIN" ? "System Administrator" : u.role.replace(/_/g, " ")})
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDateFrom("");
            setDateTo("");
            setUserFilter("");
            setPage(1);
          }}
        >
          Clear Filters
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchHistory}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <DataTable
        columns={columns}
        data={sessions}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortBy=""
        sortOrder="asc"
        onPageChange={setPage}
        onPageSizeChange={(size: number) => {
          setPageSize(size);
          setPage(1);
        }}
        onSort={() => {}}
        loading={loading}
        emptyMessage="No session history found."
      />
    </div>
  );
}
