import { Customer, BookingListItem } from './models';

export interface MobileLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: Customer;
}

export interface MobileRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface BookingListResponse {
  data: BookingListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  detail: string;
}

export interface ThemeResponse {
  theme_name: string;
  colors: {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    accent: string;
    gradient: string[];
  };
}
