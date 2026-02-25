export interface CheckerUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  route_id: number | null;
  route_name: string | null;
}

export interface VerificationItemDetail {
  item_name: string;
  quantity: number;
  is_vehicle: boolean;
  vehicle_no: string | null;
}

export interface VerificationResult {
  source: 'booking' | 'ticket';
  id: number;
  reference_no: number;
  status: string;
  route_name: string | null;
  branch_name: string | null;
  travel_date: string;
  departure: string | null;
  net_amount: number;
  passenger_count: number;
  items: VerificationItemDetail[];
  checked_in_at: string | null;
  verification_code: string | null;
}

export interface CheckInResult {
  message: string;
  source: string;
  id: number;
  reference_no: number;
  checked_in_at: string;
}

export type VerificationOutcome = 'success' | 'already_verified' | 'error';

export interface VerificationRecord {
  outcome: VerificationOutcome;
  result: VerificationResult | null;
  checkIn: CheckInResult | null;
  error: string | null;
  timestamp: string;
}
