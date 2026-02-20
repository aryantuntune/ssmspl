export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "BILLING_OPERATOR"
  | "TICKET_CHECKER";

export interface RouteBranch {
  branch_id: number;
  branch_name: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  route_id: number | null;
  route_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
  menu_items: string[];
  route_branches: RouteBranch[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserCreate {
  email: string;
  username: string;
  full_name: string;
  password: string;
  role?: UserRole;
  route_id?: number | null;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface UserUpdate {
  full_name?: string;
  email?: string;
  role?: UserRole;
  route_id?: number | null;
  is_active?: boolean;
}

export interface Boat {
  id: number;
  name: string;
  no: string;
  is_active: boolean | null;
}

export interface BoatCreate {
  name: string;
  no: string;
}

export interface BoatUpdate {
  name?: string;
  no?: string;
  is_active?: boolean;
}

export interface Branch {
  id: number;
  name: string;
  address: string;
  contact_nos: string | null;
  latitude: number | null;
  longitude: number | null;
  sf_after: string | null;
  sf_before: string | null;
  is_active: boolean | null;
}

export interface BranchCreate {
  name: string;
  address: string;
  contact_nos?: string;
  latitude?: number;
  longitude?: number;
  sf_after?: string;
  sf_before?: string;
}

export interface BranchUpdate {
  name?: string;
  address?: string;
  contact_nos?: string;
  latitude?: number;
  longitude?: number;
  sf_after?: string | null;
  sf_before?: string | null;
  is_active?: boolean;
}

export interface Route {
  id: number;
  branch_id_one: number;
  branch_id_two: number;
  is_active: boolean | null;
  branch_one_name: string | null;
  branch_two_name: string | null;
}

export interface RouteCreate {
  branch_id_one: number;
  branch_id_two: number;
}

export interface RouteUpdate {
  branch_id_one?: number;
  branch_id_two?: number;
  is_active?: boolean;
}

export interface Item {
  id: number;
  name: string;
  short_name: string;
  online_visibility: boolean | null;
  is_vehicle: boolean | null;
  is_active: boolean | null;
}

export interface ItemCreate {
  name: string;
  short_name: string;
  online_visibility?: boolean;
  is_vehicle?: boolean;
}

export interface ItemUpdate {
  name?: string;
  short_name?: string;
  online_visibility?: boolean;
  is_vehicle?: boolean;
  is_active?: boolean;
}

export interface FerrySchedule {
  id: number;
  branch_id: number;
  departure: string;
  branch_name: string | null;
}

export interface FerryScheduleCreate {
  branch_id: number;
  departure: string;
}

export interface FerryScheduleUpdate {
  branch_id?: number;
  departure?: string;
}

export interface ItemRate {
  id: number;
  applicable_from_date: string | null;
  levy: number | null;
  rate: number | null;
  item_id: number | null;
  route_id: number | null;
  is_active: boolean | null;
  item_name: string | null;
  route_name: string | null;
}

export interface ItemRateCreate {
  applicable_from_date?: string | null;
  levy?: number | null;
  rate?: number | null;
  item_id: number;
  route_id: number;
}

export interface ItemRateUpdate {
  applicable_from_date?: string | null;
  levy?: number | null;
  rate?: number | null;
  item_id?: number;
  route_id?: number;
  is_active?: boolean;
}

export interface PaymentMode {
  id: number;
  description: string;
  is_active: boolean;
}

export interface PaymentModeCreate {
  description: string;
}

export interface PaymentModeUpdate {
  description?: string;
  is_active?: boolean;
}

// ── Ticket types ──

export interface TicketItem {
  id: number;
  ticket_id: number;
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no: string | null;
  is_cancelled: boolean;
  amount: number;
  item_name: string | null;
}

export interface TicketItemCreate {
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no?: string | null;
}

export interface TicketItemUpdate {
  id?: number | null;
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no?: string | null;
  is_cancelled: boolean;
}

// ── Ticket Payment types ──

export interface TicketPayement {
  id: number;
  ticket_id: number;
  payment_mode_id: number;
  amount: number;
  ref_no: string | null;
  payment_mode_name: string | null;
}

export interface TicketPayementCreate {
  payment_mode_id: number;
  amount: number;
  ref_no?: string | null;
}

export interface Ticket {
  id: number;
  branch_id: number;
  ticket_no: number;
  ticket_date: string;
  departure: string | null;
  route_id: number;
  amount: number;
  discount: number | null;
  payment_mode_id: number;
  is_cancelled: boolean;
  net_amount: number;
  branch_name: string | null;
  route_name: string | null;
  payment_mode_name: string | null;
  items: TicketItem[] | null;
  payments: TicketPayement[] | null;
}

export interface TicketCreate {
  branch_id: number;
  ticket_date: string;
  departure?: string | null;
  route_id: number;
  payment_mode_id: number;
  discount?: number;
  amount: number;
  net_amount: number;
  items: TicketItemCreate[];
  payments?: TicketPayementCreate[];
}

export interface TicketUpdate {
  departure?: string | null;
  route_id?: number;
  payment_mode_id?: number;
  discount?: number;
  amount?: number;
  net_amount?: number;
  is_cancelled?: boolean;
  items?: TicketItemUpdate[];
}

export interface RateLookupResponse {
  rate: number;
  levy: number;
  item_rate_id: number;
}

export interface DepartureOption {
  id: number;
  departure: string;
}

// ── Multi-ticket types ──

export interface MultiTicketInitItem {
  id: number;
  name: string;
  short_name: string;
  is_vehicle: boolean;
  rate: number;
  levy: number;
}

export interface MultiTicketInitPaymentMode {
  id: number;
  description: string;
}

export interface MultiTicketInit {
  route_id: number;
  route_name: string;
  branch_id: number;
  branch_name: string;
  items: MultiTicketInitItem[];
  payment_modes: MultiTicketInitPaymentMode[];
  first_ferry_time: string | null;
  last_ferry_time: string | null;
  is_off_hours: boolean;
}
