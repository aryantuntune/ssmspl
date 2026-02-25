import { CheckerUser } from './models';

export interface MobileLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: CheckerUser;
}

export interface MobileRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ApiError {
  detail: string;
}
