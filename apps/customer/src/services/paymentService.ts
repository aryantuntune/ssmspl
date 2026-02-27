import api from './api';

export interface PaymentConfig {
  gateway: string;
  configured: boolean;
}

export interface PaymentOrder {
  order_id: string;
  amount: number;
  status: string;
  payment_url: string | null;
  message?: string;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const { data } = await api.get<PaymentConfig>('/api/portal/payment/config');
  return data;
}

export async function createPaymentOrder(bookingId: number): Promise<PaymentOrder> {
  const { data } = await api.post<PaymentOrder>('/api/portal/payment/create-order', {
    booking_id: bookingId,
  });
  return data;
}

export async function verifyPayment(
  transactionId: string,
  orderId: string,
  bookingId: number,
): Promise<any> {
  const { data } = await api.post('/api/portal/payment/verify', {
    transaction_id: transactionId,
    order_id: orderId,
    booking_id: bookingId,
  });
  return data;
}

export async function simulatePayment(bookingId: number): Promise<any> {
  const { data } = await api.post(`/api/portal/bookings/${bookingId}/pay`);
  return data;
}
