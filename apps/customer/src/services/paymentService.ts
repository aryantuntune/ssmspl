import Constants from 'expo-constants';
import api from './api';

export interface PaymentConfig {
  gateway: string;
  configured: boolean;
}

export interface PaymentOrder {
  airpay_url: string;
  fields: Record<string, string>;
  order_id: string;
  simulated?: boolean;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const { data } = await api.get<PaymentConfig>('/api/portal/payment/config');
  return data;
}

export async function createPaymentOrder(bookingId: number): Promise<PaymentOrder> {
  const { data } = await api.post<PaymentOrder>('/api/portal/payment/create-order', {
    booking_id: bookingId,
    platform: 'mobile',
  });
  return data;
}

/**
 * Build the URL for the backend-hosted auto-submitting checkout form.
 * The mobile app opens this via Linking.openURL — the backend rebuilds the
 * checksummed payload and POSTs it to Airpay on the user's behalf.
 */
export function getCheckoutUrl(orderId: string): string {
  const apiUrl =
    Constants.expoConfig?.extra?.apiUrl ||
    (__DEV__ ? 'http://10.0.2.2:8000' : 'https://api.carferry.online');
  return `${apiUrl.replace(/\/+$/, '')}/api/portal/payment/initiate/${orderId}`;
}
