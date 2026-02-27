export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  OTP: { email: string };
  ForgotPassword: undefined;
  ForgotPasswordOTP: { email: string };
  ResetPassword: { email: string; otp: string };
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Booking: undefined;
};

export type BookingsStackParamList = {
  BookingsList: undefined;
  BookingDetail: { bookingId: number };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  BookingsTab: undefined;
  ProfileTab: undefined;
};
