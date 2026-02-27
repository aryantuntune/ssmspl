export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  is_verified: boolean;
  created_at: string;
  full_name: string;
}

export interface Branch {
  id: number;
  name: string;
  address?: string;
}

export interface ScheduleItem {
  id: number;
  branch_id: number;
  departure: string;
}

export interface BookableItem {
  id: number;
  name: string;
  short_name: string;
  is_vehicle: boolean;
  rate: number;
  levy: number;
  route_id: number;
}

export interface BookingItemCreate {
  item_id: number;
  quantity: number;
  vehicle_no?: string | null;
}

export interface BookingItemRead {
  id: number;
  booking_id: number;
  item_id: number;
  item_name: string | null;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no: string | null;
  is_cancelled: boolean;
  amount: number;
}

export interface Booking {
  id: number;
  booking_no: number;
  status: string;
  verification_code: string | null;
  branch_id: number;
  branch_name: string | null;
  route_id: number;
  route_name: string | null;
  travel_date: string;
  departure: string | null;
  amount: number;
  discount: number;
  net_amount: number;
  portal_user_id: number;
  is_cancelled: boolean;
  created_at: string | null;
  items: BookingItemRead[] | null;
}

export interface BookingListItem {
  id: number;
  booking_no: number;
  status: string;
  branch_name: string | null;
  route_name: string | null;
  travel_date: string;
  departure: string | null;
  net_amount: number;
  is_cancelled: boolean;
  created_at: string | null;
  items: { item_name: string; quantity: number }[] | null;
}
