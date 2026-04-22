export interface ActiveSession {
  id: number;
  user_id: string;
  session_id: string;
  started_at: string | null;
  last_heartbeat: string | null;
  ip_address: string | null;
  city: string | null;
  user_agent: string | null;
  branch_id: number | null;
  branch_name: string | null;
  route_id: number | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
  portal: string | null;
  full_name: string;
  username: string;
  role: string;
  ticket_count: number | null;
}

export interface SessionHistory extends ActiveSession {
  ended_at: string | null;
  end_reason: string | null;
}

export interface SessionUser {
  id: string;
  full_name: string;
  username: string;
  role: string;
}

export interface SessionActivitySummary {
  action_type: string;
  count: number;
}
