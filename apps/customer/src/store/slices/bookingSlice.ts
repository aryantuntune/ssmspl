import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Branch, ScheduleItem, BookableItem, Booking, BookingListItem, BookingItemCreate } from '../../types';
import { BookingListResponse } from '../../types';
import * as bookingService from '../../services/bookingService';
import { friendlyError } from '../../utils/errorMessages';

interface BookingFormItem extends BookableItem {
  quantity: number;
  vehicle_no?: string;
}

interface BookingState {
  branches: Branch[];
  toBranches: Branch[];
  schedules: ScheduleItem[];
  items: BookableItem[];
  fromBranch: Branch | null;
  toBranch: Branch | null;
  travelDate: string;
  departure: string;
  formItems: BookingFormItem[];
  totalAmount: number;
  bookings: BookingListItem[];
  currentBooking: Booking | null;
  page: number;
  totalPages: number;
  isLoadingForm: boolean;
  isLoadingBookings: boolean;
  isCreating: boolean;
  error: string | null;
}

const initialState: BookingState = {
  branches: [],
  toBranches: [],
  schedules: [],
  items: [],
  fromBranch: null,
  toBranch: null,
  travelDate: '',
  departure: '',
  formItems: [],
  totalAmount: 0,
  bookings: [],
  currentBooking: null,
  page: 1,
  totalPages: 1,
  isLoadingForm: false,
  isLoadingBookings: false,
  isCreating: false,
  error: null,
};

export const fetchBranches = createAsyncThunk('booking/fetchBranches', async (_, { rejectWithValue }) => {
  try { return await bookingService.getBranches(); }
  catch (err: any) { return rejectWithValue(friendlyError(err)); }
});

export const fetchToBranches = createAsyncThunk('booking/fetchToBranches', async (fromBranchId: number, { rejectWithValue }) => {
  try { return await bookingService.getToBranches(fromBranchId); }
  catch (err: any) { return rejectWithValue(friendlyError(err)); }
});

export const fetchItems = createAsyncThunk('booking/fetchItems', async (params: { from: number; to: number }, { rejectWithValue }) => {
  try { return await bookingService.getItems(params.from, params.to); }
  catch (err: any) { return rejectWithValue(friendlyError(err)); }
});

export const fetchSchedules = createAsyncThunk('booking/fetchSchedules', async (branchId: number, { rejectWithValue }) => {
  try { return await bookingService.getSchedules(branchId); }
  catch (err: any) { return rejectWithValue(friendlyError(err)); }
});

export const createBooking = createAsyncThunk(
  'booking/create',
  async (params: {
    from_branch_id: number;
    to_branch_id: number;
    travel_date: string;
    departure: string;
    items: BookingItemCreate[];
  }, { rejectWithValue }) => {
    try {
      return await bookingService.createBooking(
        params.from_branch_id, params.to_branch_id,
        params.travel_date, params.departure, params.items,
      );
    } catch (err: any) { return rejectWithValue(friendlyError(err)); }
  },
);

export const fetchBookings = createAsyncThunk(
  'booking/fetchBookings',
  async (params: { page: number; pageSize?: number }, { rejectWithValue }) => {
    try { return await bookingService.getBookings(params.page, params.pageSize); }
    catch (err: any) { return rejectWithValue(friendlyError(err)); }
  },
);

export const fetchBookingDetail = createAsyncThunk(
  'booking/fetchDetail',
  async (bookingId: number, { rejectWithValue }) => {
    try { return await bookingService.getBookingDetail(bookingId); }
    catch (err: any) { return rejectWithValue(friendlyError(err)); }
  },
);

export const cancelBookingThunk = createAsyncThunk(
  'booking/cancel',
  async (bookingId: number, { rejectWithValue }) => {
    try { return await bookingService.cancelBooking(bookingId); }
    catch (err: any) { return rejectWithValue(friendlyError(err)); }
  },
);

function computeTotal(items: BookingFormItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * (item.rate + item.levy), 0);
}

const bookingSlice = createSlice({
  name: 'booking',
  initialState,
  reducers: {
    setFromBranch(state, action: PayloadAction<Branch>) {
      state.fromBranch = action.payload;
      state.toBranch = null;
      state.formItems = [];
      state.totalAmount = 0;
    },
    setToBranch(state, action: PayloadAction<Branch>) {
      state.toBranch = action.payload;
    },
    setTravelDate(state, action: PayloadAction<string>) {
      state.travelDate = action.payload;
    },
    setDeparture(state, action: PayloadAction<string>) {
      state.departure = action.payload;
    },
    updateItemQty(state, action: PayloadAction<{ itemId: number; quantity: number; vehicleNo?: string }>) {
      const { itemId, quantity, vehicleNo } = action.payload;
      const idx = state.formItems.findIndex((i) => i.id === itemId);
      if (idx >= 0) {
        if (quantity <= 0) {
          state.formItems.splice(idx, 1);
        } else {
          state.formItems[idx].quantity = quantity;
          if (vehicleNo !== undefined) state.formItems[idx].vehicle_no = vehicleNo;
        }
      } else if (quantity > 0) {
        const item = state.items.find((i) => i.id === itemId);
        if (item) {
          state.formItems.push({ ...item, quantity, vehicle_no: vehicleNo });
        }
      }
      state.totalAmount = computeTotal(state.formItems);
    },
    clearBookingForm(state) {
      state.fromBranch = null;
      state.toBranch = null;
      state.travelDate = '';
      state.departure = '';
      state.formItems = [];
      state.totalAmount = 0;
      state.toBranches = [];
      state.schedules = [];
      state.items = [];
    },
    clearBookingError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranches.fulfilled, (state, action) => { state.branches = action.payload; })
      .addCase(fetchToBranches.pending, (state) => { state.isLoadingForm = true; })
      .addCase(fetchToBranches.fulfilled, (state, action) => { state.toBranches = action.payload; state.isLoadingForm = false; })
      .addCase(fetchToBranches.rejected, (state) => { state.isLoadingForm = false; })
      .addCase(fetchItems.fulfilled, (state, action) => { state.items = action.payload; })
      .addCase(fetchSchedules.fulfilled, (state, action) => { state.schedules = action.payload; })
      .addCase(createBooking.pending, (state) => { state.isCreating = true; state.error = null; })
      .addCase(createBooking.fulfilled, (state, action) => {
        state.isCreating = false;
        state.currentBooking = action.payload;
      })
      .addCase(createBooking.rejected, (state, action) => {
        state.isCreating = false;
        state.error = action.payload as string;
      })
      .addCase(fetchBookings.pending, (state) => { state.isLoadingBookings = true; })
      .addCase(fetchBookings.fulfilled, (state, action) => {
        state.isLoadingBookings = false;
        const resp = action.payload;
        state.bookings = resp.page === 1 ? resp.data : [...state.bookings, ...resp.data];
        state.page = resp.page;
        state.totalPages = resp.total_pages;
      })
      .addCase(fetchBookings.rejected, (state) => { state.isLoadingBookings = false; })
      .addCase(fetchBookingDetail.pending, (state) => { state.isLoadingBookings = true; })
      .addCase(fetchBookingDetail.fulfilled, (state, action) => {
        state.isLoadingBookings = false;
        state.currentBooking = action.payload;
      })
      .addCase(fetchBookingDetail.rejected, (state, action) => {
        state.isLoadingBookings = false;
        state.error = action.payload as string;
      })
      .addCase(cancelBookingThunk.fulfilled, (state, action) => {
        state.currentBooking = action.payload;
        const idx = state.bookings.findIndex((b) => b.id === action.payload.id);
        if (idx >= 0) {
          state.bookings[idx].status = action.payload.status;
          state.bookings[idx].is_cancelled = action.payload.is_cancelled;
        }
      });
  },
});

export const {
  setFromBranch, setToBranch, setTravelDate, setDeparture,
  updateItemQty, clearBookingForm, clearBookingError,
} = bookingSlice.actions;
export default bookingSlice.reducer;
