// Names and order are shared across the phone tabs and desktop sidebar.
export const tripNavigation = [
  { key: 'itinerary', label: 'しおり', accessibilityLabel: 'しおり', icon: 'calendar_month' },
  { key: 'places', label: '場所', accessibilityLabel: '行きたい場所', icon: 'location_on' },
  { key: 'bookings', label: '予約', accessibilityLabel: '予約', icon: 'confirmation_number' },
  { key: 'packing', label: '準備', accessibilityLabel: '準備', icon: 'checklist' },
  { key: 'notes', label: 'メモ', accessibilityLabel: 'メモ', icon: 'description' },
] as const;
