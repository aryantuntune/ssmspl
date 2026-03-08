import api from './api';

export interface PaymentConfig {
  gateway: string;
  configured: boolean;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const { data } = await api.get<PaymentConfig>('/api/portal/payment/config');
  return data;
}
