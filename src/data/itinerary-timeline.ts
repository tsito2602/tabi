import type { Booking, BookingKind, ItineraryItem, Place } from './types';
import { orderItineraryEntries } from './itinerary';

export const BOOKING_STAGES: Record<BookingKind, [string, string]> = {
  flight: ['出発', '到着'],
  hotel: ['チェックイン', 'チェックアウト'],
  train: ['乗車', '到着'],
  car: ['受取', '返却'],
  restaurant: ['予約', '終了'],
  ticket: ['利用', '終了'],
  other: ['予約', '終了'],
};

export type TimelineEntry = {
  key: string;
  day: string;
  time: string;
  title: string;
  note: string;
  item?: ItineraryItem;
  booking?: Booking;
  bookingStage?: string;
  bookingEndpoint?: 'start' | 'end';
};

function bookingNote(booking: Booking) {
  if (booking.origin || booking.destination) {
    return `${booking.originCode || booking.origin} → ${booking.destinationCode || booking.destination}`;
  }
  return booking.detail;
}

export function bookingTimelineEntries(booking: Booking): TimelineEntry[] {
  const [startStage, endStage] = BOOKING_STAGES[booking.kind];
  const entries: TimelineEntry[] = [{
    key: `booking-${booking.id}-start`,
    day: booking.day,
    time: booking.time,
    title: booking.title,
    note: bookingNote(booking),
    booking,
    bookingStage: startStage,
    bookingEndpoint: 'start',
  }];

  if (booking.endTime && (booking.endDay !== booking.day || booking.endTime !== booking.time)) {
    entries.push({
      key: `booking-${booking.id}-end`,
      day: booking.endDay || booking.day,
      time: booking.endTime,
      title: booking.title,
      note: bookingNote(booking),
      booking,
      bookingStage: endStage,
      bookingEndpoint: 'end',
    });
  }
  return entries;
}

// The planning preview and the actual itinerary must use the same endpoints
// and ordering, including overnight bookings and anchored transport entries.
export function itineraryTimeline(items: ItineraryItem[], bookings: Booking[], places: Place[]): TimelineEntry[] {
  return orderItineraryEntries([
    ...items.map<TimelineEntry>((item) => ({ key: `item-${item.id}`, day: item.day, time: item.time, title: places.find((place) => place.itineraryItemId === item.id)?.title ?? item.title, note: item.note, item })),
    ...bookings.flatMap(bookingTimelineEntries),
  ]);
}
