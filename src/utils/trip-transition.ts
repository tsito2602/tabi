// Native navigation keeps the platform's own stack transition.
export function openTripTransition(_tripId: string, navigate: () => void) { navigate(); }
export function closeTripTransition(_tripId: string, navigate: () => void) { navigate(); }
export function getTripListSearch() { return ''; }
export function rememberTripListSearch(_search: string) {}
