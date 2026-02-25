import api from './api';
import { VerificationResult, CheckInResult } from '../types';

export async function scanQR(payload: string): Promise<VerificationResult> {
  const { data } = await api.get<VerificationResult>('/api/verification/scan', {
    params: { payload },
  });
  return data;
}

export async function checkIn(verificationCode: string): Promise<CheckInResult> {
  const { data } = await api.post<CheckInResult>('/api/verification/check-in', {
    verification_code: verificationCode,
  });
  return data;
}

export async function lookupBooking(
  bookingNo: number,
  branchId?: number,
): Promise<VerificationResult> {
  const { data } = await api.get<VerificationResult>('/api/verification/booking-number', {
    params: { booking_no: bookingNo, branch_id: branchId },
  });
  return data;
}

export async function lookupTicket(
  ticketNo: number,
  branchId: number,
): Promise<VerificationResult> {
  const { data } = await api.get<VerificationResult>('/api/verification/ticket', {
    params: { ticket_no: ticketNo, branch_id: branchId },
  });
  return data;
}
