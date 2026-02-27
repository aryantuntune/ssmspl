import api from './api';
import { Branch, ScheduleItem, BookableItem, Booking, BookingItemCreate } from '../types';
import { BookingListResponse } from '../types';

export async function getBranches(): Promise<Branch[]> {
  const { data } = await api.get<Branch[]>('/api/booking/branches');
  return data;
}

export async function getToBranches(fromBranchId: number): Promise<Branch[]> {
  const { data } = await api.get<Branch[]>(`/api/booking/to-branches/${fromBranchId}`);
  return data;
}

export async function getItems(fromBranchId: number, toBranchId: number): Promise<BookableItem[]> {
  const { data } = await api.get<BookableItem[]>(`/api/booking/items/${fromBranchId}/${toBranchId}`);
  return data;
}

export async function getSchedules(branchId: number): Promise<ScheduleItem[]> {
  const { data } = await api.get<ScheduleItem[]>(`/api/booking/schedules/${branchId}`);
  return data;
}

export async function createBooking(
  from_branch_id: number,
  to_branch_id: number,
  travel_date: string,
  departure: string,
  items: BookingItemCreate[],
): Promise<Booking> {
  const { data } = await api.post<Booking>('/api/portal/bookings', {
    from_branch_id,
    to_branch_id,
    travel_date,
    departure,
    items,
  });
  return data;
}

export async function getBookings(page: number = 1, pageSize: number = 10): Promise<BookingListResponse> {
  const { data } = await api.get<BookingListResponse>(`/api/portal/bookings?page=${page}&page_size=${pageSize}`);
  return data;
}

export async function getBookingDetail(bookingId: number): Promise<Booking> {
  const { data } = await api.get<Booking>(`/api/portal/bookings/${bookingId}`);
  return data;
}

export async function cancelBooking(bookingId: number): Promise<Booking> {
  const { data } = await api.post<Booking>(`/api/portal/bookings/${bookingId}/cancel`);
  return data;
}

export async function getBookingQrUrl(bookingId: number): Promise<string> {
  const baseURL = api.defaults.baseURL;
  return `${baseURL}/api/portal/bookings/${bookingId}/qr`;
}
