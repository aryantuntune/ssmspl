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
  email: string | null;
  username: string;
  full_name: string;
  mobile_number: string | null;
  role: UserRole;
  route_id: number | null;
  route_name: string | null;
  active_branch_id: number | null;
  is_active: boolean;
  is_verified: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
  menu_items: string[];
  route_branches: RouteBranch[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserCreate {
  email?: string;
  username: string;
  full_name: string;
  mobile_number?: string;
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
  username?: string;
  email?: string;
  mobile_number?: string;
  role?: UserRole;
  route_id?: number | null;
  is_active?: boolean;
}

export interface Boat {
  id: number;
  name: string;
  no: string;
  is_active: boolean | null;
  route_id: number | null;
  route_name: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BoatCreate {
  name: string;
  no: string;
  route_id?: number | null;
}

export interface BoatUpdate {
  name?: string;
  no?: string;
  is_active?: boolean;
  route_id?: number | null;
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
  last_booking_no?: number;
  created_at?: string;
  updated_at?: string;
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
  multi_ticketing_enabled: boolean;
  branch_one_name: string | null;
  branch_two_name: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RouteCreate {
  branch_id_one: number;
  branch_id_two: number;
}

export interface RouteUpdate {
  branch_id_one?: number;
  branch_id_two?: number;
  is_active?: boolean;
  multi_ticketing_enabled?: boolean;
}

export interface Item {
  id: number;
  name: string;
  short_name: string;
  online_visibility: boolean | null;
  is_vehicle: boolean | null;
  is_active: boolean | null;
  created_at?: string;
  updated_at?: string;
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
  created_at?: string;
  updated_at?: string;
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
  levy: number | null;
  rate: number | null;
  item_id: number | null;
  route_id: number | null;
  is_active: boolean | null;
  item_name: string | null;
  route_name: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ItemRateCreate {
  levy?: number | null;
  rate?: number | null;
  item_id: number;
  route_id: number;
}

export interface ItemRateUpdate {
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
  show_at_pos: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentModeCreate {
  description: string;
  show_at_pos: boolean;
}

export interface PaymentModeUpdate {
  description?: string;
  is_active?: boolean;
  show_at_pos?: boolean;
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
  item_short_name: string | null;
}

export interface TicketItemCreate {
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no?: string | null;
  vehicle_name?: string | null;
}

export interface TicketItemUpdate {
  id?: number | null;
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no?: string | null;
  vehicle_name?: string | null;
  is_cancelled: boolean;
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
  status: string | null;
  checked_in_at: string | null;
  verification_code: string | null;
  branch_name: string | null;
  route_name: string | null;
  payment_mode_name: string | null;
  boat_id: number | null;
  boat_name: string | null;
  items: TicketItem[] | null;
  ref_no: string | null;
  created_at?: string;
  updated_at?: string;
  created_by_username?: string | null;
  is_multi_ticket?: boolean;
  generated_at?: string | null;
}

export interface TicketCreate {
  branch_id: number;
  ticket_date: string;
  departure?: string | null;
  route_id: number;
  payment_mode_id: number;
  ref_no?: string | null;
  discount?: number;
  amount: number;
  net_amount: number;
  items: TicketItemCreate[];
}

export interface TicketUpdate {
  branch_id?: number;
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
  multi_ticketing_enabled: boolean;
  items: MultiTicketInitItem[];
  payment_modes: MultiTicketInitPaymentMode[];
  first_ferry_time: string | null;
  last_ferry_time: string | null;
  is_off_hours: boolean;
  sf_item_id: number | null;
  sf_rate: number | null;
  sf_levy: number | null;
}

export interface TicketingStatus {
  normal_ticketing_open: boolean;
  multi_ticketing_open: boolean;
  first_ferry_time: string | null;
  last_ferry_time: string | null;
  normal_opens_at: string | null;
  normal_closes_at: string | null;
  multi_opens_at: string | null;
  current_time: string;
}

// ── Company types ──

export interface Company {
  id: number;
  name: string;
  short_name: string | null;
  reg_address: string | null;
  gst_no: string | null;
  pan_no: string | null;
  tan_no: string | null;
  cin_no: string | null;
  contact: string | null;
  email: string | null;
  sf_item_id: number | null;
  active_theme: string | null;
  time_lock_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CompanyUpdate {
  name?: string;
  short_name?: string | null;
  reg_address?: string | null;
  gst_no?: string | null;
  pan_no?: string | null;
  tan_no?: string | null;
  cin_no?: string | null;
  contact?: string | null;
  email?: string | null;
  sf_item_id?: number | null;
  active_theme?: string | null;
}

// ── Booking types ──

export interface BookingItem {
  id: number;
  booking_id: number;
  item_id: number;
  rate: number;
  levy: number;
  vehicle_no: string | null;
  is_cancelled: boolean;
  quantity: number;
  created_at?: string;
  updated_at?: string;
}

export interface Booking {
  id: number;
  branch_id: number;
  booking_no: number;
  travel_date: string;
  departure: string | null;
  amount: number;
  discount: number | null;
  payment_mode_id: number;
  is_cancelled: boolean;
  net_amount: number;
  route_id: number;
  portal_user_id: number | null;
  created_at?: string;
  updated_at?: string;
}

// ── System update log types ──

export interface SysUpdateLog {
  id: number;
  entity_name: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  updated_by: string | null;
  updated_at: string;
}

// ── Daily report recipient types ──

export interface DailyReportRecipient {
  id: number;
  email: string;
  label: string | null;
  is_active: boolean;
}

// ── Refresh token types ──

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked: boolean;
  created_at?: string;
  updated_at?: string;
}

// ── Backup types ──

export interface BackupFile {
  filename: string;
  size_bytes: number;
  size_human: string;
  created_at: string;
  gdrive_synced: boolean | null;
}

export interface BackupStatus {
  last_backup_time: string | null;
  last_backup_file: string | null;
  last_backup_size: string | null;
  last_backup_status: string | null;
  last_sync_time: string | null;
  last_synced_file: string | null;
  last_sync_status: string | null;
  gdrive_backup_count: number | null;
  schedule: string;
  local_retention_days: number;
  gdrive_retention_days: number;
  backup_in_progress: boolean;
}

export interface BackupNotificationRecipient {
  id: number;
  email: string;
  label: string | null;
  is_active: boolean;
}
