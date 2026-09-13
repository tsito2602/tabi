export type TripRole = 'owner' | 'editor' | 'viewer';
export type TripMember = { id: string; name: string | null; email: string; avatarUrl?: string | null; role: TripRole };

export type Trip = {
  id: string;
  name: string;
  destination: string;
  startsOn: string;
  endsOn: string;
  role: TripRole;
  memberCount: number;
  coverImage?: string;
  updatedAt?: number;
};

export type ItineraryCategory = 'sightseeing' | 'meal' | 'transport' | 'shopping' | 'other';
export type TransportMode = 'walk' | 'train' | 'bus' | 'car' | 'taxi' | 'flight' | 'boat' | 'other';
export type ItineraryDetails = {
  category: ItineraryCategory;
  location: string;
  endDay: string;
  endTime: string;
  transport?: { mode: TransportMode; origin: string; destination: string; durationMinutes?: number; afterKey?: string };
};

export type ItineraryItem = {
  id: string;
  day: string;
  time: string;
  kind: string;
  title: string;
  note: string;
  details?: ItineraryDetails;
  updatedBy?: string;
  updatedAt?: number;
};

export type BookingKind = 'flight' | 'hotel' | 'train' | 'car' | 'restaurant' | 'ticket' | 'other';

export type FlightConnectionMode = 'auto' | 'manual' | 'none';

export type Booking = {
  id: string;
  kind: BookingKind;
  title: string;
  detail: string;
  location?: string;
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  day: string;
  time: string;
  endDay: string;
  endTime: string;
  durationMinutes?: number | null;
  confirmationCode: string;
  note: string;
  connectionMode?: FlightConnectionMode;
  nextFlightId?: string | null;
  updatedBy?: string;
  updatedAt?: number;
};

export type BookingDocument = {
  id: string;
  bookingId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedBy?: string;
  createdAt: number;
};

export type PackingItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  packed: boolean;
  assignee?: string;
  shared?: boolean;
  updatedBy?: string;
  updatedAt?: number;
};

export type TravelTask = {
  id: string;
  title: string;
  dueOn: string;
  assignee: string;
  done: boolean;
  updatedBy?: string;
  updatedAt?: number;
};

export type PlaceStatus = 'want' | 'planned' | 'visited' | 'skipped';
export type ReservationStatus = 'not_needed' | 'unavailable' | 'needed' | 'requested' | 'confirmed';
export type PlaceReferenceLink = { label: string; url: string };
export type Place = {
  id: string;
  title: string;
  note: string;
  openingHours: string;
  reservationStatus: ReservationStatus;
  location: string;
  referenceLinks?: PlaceReferenceLink[];
  itineraryItemId?: string | null;
  status: PlaceStatus;
  updatedAt?: number;
};
export type PlaceInput = Omit<Place, 'id' | 'updatedAt'>;

export type TravelNote = { id: string; body: string; pinned: boolean; updatedAt: number };
export type NoteInput = Pick<TravelNote, 'body' | 'pinned'>;

export type PendingMutation = {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
};

export type TravelCache = {
  version: 1;
  trips: Trip[];
  selectedTripId: string | null;
  itemsByTrip: Record<string, ItineraryItem[]>;
  bookingsByTrip: Record<string, Booking[]>;
  documentsByBooking: Record<string, BookingDocument[]>;
  packingByTrip: Record<string, PackingItem[]>;
  tasksByTrip: Record<string, TravelTask[]>;
  placesByTrip: Record<string, Place[]>;
  notesByTrip?: Record<string, TravelNote[]>;
  membersByTrip?: Record<string, TripMember[]>;
  pending: PendingMutation[];
};

export const emptyTravelCache = (): TravelCache => ({
  version: 1,
  trips: [],
  selectedTripId: null,
  itemsByTrip: {},
  bookingsByTrip: {},
  documentsByBooking: {},
  packingByTrip: {},
  tasksByTrip: {},
  placesByTrip: {},
  notesByTrip: {},
  pending: [],
});

export const normalizeTravelCache = (value: TravelCache): TravelCache => ({
  ...value,
  placesByTrip: value.placesByTrip ?? {},
  notesByTrip: value.notesByTrip ?? {},
  documentsByBooking: Object.fromEntries(
    Object.entries(value.documentsByBooking ?? {}).map(([bookingId, documents]) => [
      bookingId,
      documents.map((document) => ({
        ...document,
        bookingId: document.bookingId ?? bookingId,
        size: Math.max(0, document.size ?? 0),
        createdAt: document.createdAt ?? 0,
      })),
    ]),
  ),
  tasksByTrip: Object.fromEntries(
    Object.entries(value.tasksByTrip ?? {}).map(([tripId, tasks]) => [
      tripId,
      tasks.map((task) => ({
        ...task,
        dueOn: task.dueOn ?? '',
        assignee: task.assignee ?? '',
        done: Boolean(task.done),
      })),
    ]),
  ),
  packingByTrip: Object.fromEntries(
    Object.entries(value.packingByTrip ?? {}).map(([tripId, items]) => [
      tripId,
      items.map((item) => ({
        ...item,
        category: item.category ?? 'その他',
        quantity: Math.max(1, item.quantity ?? 1),
        packed: Boolean(item.packed),
        assignee: item.assignee ?? '',
        shared: item.shared ?? false,
      })),
    ]),
  ),
  bookingsByTrip: Object.fromEntries(
    Object.entries(value.bookingsByTrip ?? {}).map(([tripId, bookings]) => [
      tripId,
      bookings.map((booking) => ({
        ...booking,
        origin: booking.origin ?? '',
        originCode: booking.originCode ?? '',
        destination: booking.destination ?? '',
        destinationCode: booking.destinationCode ?? '',
        endDay: booking.endDay ?? booking.day,
        endTime: booking.endTime ?? '',
      })),
    ]),
  ),
});
