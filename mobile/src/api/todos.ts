/**
 * Project-todos API client.
 *
 * Talks to ADMIN portal (`/api/todos`) regardless of which server is the
 * active one in the multi-server switcher — todos are a dev/ops scratchpad
 * tied to the admin side, not to per-server operational state.
 */
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { getServer } from '../lib/config';

export type TodoStatus = 'open' | 'in_progress' | 'done' | 'wont_do';
export type TodoPriority = 'low' | 'medium' | 'high';

export type Todo = {
  id: number;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TodoCreate = {
  title: string;
  description?: string | null;
  priority?: TodoPriority;
  tags?: string[];
};

export type TodoUpdate = {
  title?: string;
  description?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  tags?: string[];
  notes?: string | null;
};

export type TodoStats = {
  open: number;
  in_progress: number;
  done: number;
  wont_do: number;
  high_priority_open: number;
  oldest_open_days: number | null;
};

async function adminClient() {
  // Todos live exclusively on the admin server. The mobile app may be
  // "viewing" Server 1 but still hits Server 2 for todos. We pull the
  // server2-namespaced access token directly from SecureStore (the public
  // `tokens.getAccess()` helper resolves the ACTIVE server, which may be
  // server1). If the user hasn't signed into server2 recently, calls will
  // 401 and the screen surfaces that.
  const url = getServer('server2').url;
  const access = await SecureStore.getItemAsync('ssmspl_server2_access_token');
  return axios.create({
    baseURL: url,
    timeout: 10_000,
    headers: access ? { Authorization: `Bearer ${access}` } : {},
  });
}

export async function listTodos(opts: {
  status?: TodoStatus | TodoStatus[];
  priority?: TodoPriority;
  tag?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: Todo[]; total: number }> {
  const c = await adminClient();
  const params: Record<string, string | number> = {};
  if (opts.status) params.status = Array.isArray(opts.status) ? opts.status.join(',') : opts.status;
  if (opts.priority) params.priority = opts.priority;
  if (opts.tag) params.tag = opts.tag;
  if (opts.limit != null) params.limit = opts.limit;
  if (opts.offset != null) params.offset = opts.offset;
  const r = await c.get('/api/todos', { params });
  return r.data;
}

export async function getTodoStats(): Promise<TodoStats> {
  const c = await adminClient();
  const r = await c.get('/api/todos/stats');
  return r.data;
}

export async function createTodo(payload: TodoCreate): Promise<Todo> {
  const c = await adminClient();
  const r = await c.post('/api/todos', payload);
  return r.data;
}

export async function updateTodo(id: number, payload: TodoUpdate): Promise<Todo> {
  const c = await adminClient();
  const r = await c.patch(`/api/todos/${id}`, payload);
  return r.data;
}

export async function deleteTodo(id: number): Promise<void> {
  const c = await adminClient();
  await c.delete(`/api/todos/${id}`);
}
