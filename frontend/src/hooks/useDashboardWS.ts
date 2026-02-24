import { useEffect, useRef, useState, useCallback } from "react";

export interface DashboardStats {
  ticket_count: number;
  today_revenue: number;
  active_ferries: number;
  active_branches: number;
}

interface UseDashboardWSResult {
  stats: DashboardStats | null;
  connected: boolean;
}

export function useDashboardWS(): UseDashboardWSResult {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    // Build WS URL on same origin (proxied by nginx in production)
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/dashboard/ws`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) {
          ws.close();
          return;
        }
        setConnected(true);
        retryRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as DashboardStats;
          setStats(data);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (unmountedRef.current) return;
        // Exponential backoff: 1s -> 2s -> 4s -> 8s -> max 10s
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 10000);
        retryRef.current++;
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
      };
    } catch {
      // WebSocket constructor can throw if URL is invalid
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { stats, connected };
}
