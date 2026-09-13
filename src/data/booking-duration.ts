import { findAirportByCode } from './airports';
import { localDateTimeToEpoch } from './flight-connections';
import { durationLabel } from './itinerary';
import type { Booking } from './types';

type DurationInput = Pick<Booking, 'kind' | 'day' | 'time' | 'endDay' | 'endTime' | 'originCode' | 'destinationCode' | 'durationMinutes'>;
export function bookingDuration(booking: DurationInput): { minutes: number; source: 'manual' | 'airports' | 'local' } | null {
  if (booking.kind !== 'flight' && booking.kind !== 'train') return null;
  if (booking.durationMinutes != null) return Number.isInteger(booking.durationMinutes) && booking.durationMinutes > 0 && booking.durationMinutes <= 10080 ? { minutes: booking.durationMinutes, source: 'manual' } : null;
  const originZone = booking.kind === 'flight' ? findAirportByCode(booking.originCode)?.timeZone : undefined;
  const destinationZone = booking.kind === 'flight' ? findAirportByCode(booking.destinationCode)?.timeZone : undefined;
  // Unlike a layover, the two ends of a flight may be in different zones.
  // An unknown airport must never fall back to subtracting local clock times.
  if (booking.kind === 'flight' && (!originZone || !destinationZone)) return null;
  const departure = localDateTimeToEpoch(booking.day, booking.time, originZone);
  const arrival = localDateTimeToEpoch(booking.endDay || booking.day, booking.endTime, destinationZone);
  if (departure === null || arrival === null || arrival <= departure) return null;
  return { minutes: Math.round((arrival - departure) / 60000), source: booking.kind === 'flight' ? 'airports' : 'local' };
}
export function bookingDurationLabel(booking: DurationInput) {
  const duration = bookingDuration(booking);
  if (!duration) return '';
  return `${booking.kind === 'flight' ? '飛行時間' : '乗車時間'} ${durationLabel(duration.minutes)}${duration.source === 'local' ? '（時差なし）' : ''}`;
}
