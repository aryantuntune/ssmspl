export function friendlyError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Something went wrong. Please try again.';
  const err = error as any;
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
    return 'Unable to connect. Please check your internet.';
  }
  const status = err.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission for this action.';
  if (status === 404) return 'Not found. Please check and try again.';
  if (status === 409) {
    const detail = err.response?.data?.detail;
    return typeof detail === 'string' ? detail : 'This action was already performed.';
  }
  if (status === 422) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return 'Invalid input. Please check your data.';
  }
  if (status && status >= 500) return 'Server error. Please try again later.';
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return 'Something went wrong. Please try again.';
}
