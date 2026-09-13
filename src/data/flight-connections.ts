import { findAirportByCode } from './airports';
import type { Booking } from './types';

const MIN_CONNECTION_MINUTES = 30;
const MAX_CONNECTION_MINUTES = 24 * 60;

export type FlightConnectionInput = Pick<
  Booking,
  'id' | 'kind' | 'day' | 'time' | 'endDay' | 'endTime' | 'originCode' | 'destinationCode' | 'connectionMode' | 'nextFlightId'
>;

export type FlightConnection = {
  arrivalBookingId: string;
  departureBookingId: string;
  airportCode: string;
  airportName: string;
  durationMinutes: number;
  mode: 'auto' | 'manual';
};

export function localDateTimeToEpoch(day: string, time: string, timeZone?: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const wallClockAsUtc = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  if (new Date(wallClockAsUtc).toISOString().slice(0, 10) !== day) return null;
  // Both sides of a connection are at the same airport, so wall-clock time is
  // still enough to calculate the layover when an imported IATA code is not in
  // the bundled airport list yet.
  if (!timeZone) return wallClockAsUtc;
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  let epoch = wallClockAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch)).map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const nextEpoch = wallClockAsUtc - (renderedAsUtc - epoch);
    if (Math.abs(nextEpoch - epoch) < 1000) return nextEpoch;
    epoch = nextEpoch;
  }
  // A nonexistent local time during a DST jump must not become a false link.
  return null;
}

function endpointEpoch(booking: FlightConnectionInput, endpoint: 'arrival' | 'departure') {
  const code = endpoint === 'arrival' ? booking.destinationCode : booking.originCode;
  const airport = findAirportByCode(code);
  const day = endpoint === 'arrival' ? booking.endDay : booking.day;
  const time = endpoint === 'arrival' ? booking.endTime : booking.time;
  return localDateTimeToEpoch(day, time, airport?.timeZone);
}

export function connectionBetween(arrival: FlightConnectionInput, departure: FlightConnectionInput): FlightConnection | null {
  const airportCode = arrival.destinationCode.trim().toUpperCase();
  if (arrival.kind !== 'flight' || departure.kind !== 'flight' || arrival.id === departure.id
    || !airportCode || airportCode !== departure.originCode.trim().toUpperCase()) return null;
  const arrivalEpoch = endpointEpoch(arrival, 'arrival');
  const departureEpoch = endpointEpoch(departure, 'departure');
  if (arrivalEpoch === null || departureEpoch === null || departureEpoch <= arrivalEpoch) return null;
  const airport = findAirportByCode(airportCode);
  return {
    arrivalBookingId: arrival.id, departureBookingId: departure.id,
    airportCode, airportName: airport?.city || airport?.name || airportCode,
    durationMinutes: Math.round((departureEpoch - arrivalEpoch) / 60000), mode: 'manual',
  };
}

export function flightConnectionCandidates(arrival: FlightConnectionInput, bookings: readonly Booking[]) {
  return bookings.flatMap((booking) => {
    const connection = connectionBetween(arrival, booking);
    if (!connection) return [];
    const assigned = bookings.find((other) => other.id !== arrival.id && other.connectionMode === 'manual' && other.nextFlightId === booking.id);
    return [{ booking, connection, assigned }];
  }).sort((a, b) => a.connection.durationMinutes - b.connection.durationMinutes || a.booking.id.localeCompare(b.booking.id));
}

export function createsFlightConnectionCycle(bookings: readonly FlightConnectionInput[], arrivalId: string, departureId: string) {
  const visited = new Set([arrivalId]);
  let id: string | null | undefined = departureId;
  while (id) {
    if (visited.has(id)) return true;
    visited.add(id);
    const flight = bookings.find((booking) => booking.id === id);
    id = flight?.connectionMode === 'manual' ? flight.nextFlightId : null;
  }
  return false;
}

export function hasLikelyFlightConnection(arrival: FlightConnectionInput, bookings: readonly Booking[]) {
  return flightConnectionCandidates(arrival, bookings).some(({ connection, assigned }) => !assigned
    && connection.durationMinutes >= MIN_CONNECTION_MINUTES && connection.durationMinutes <= MAX_CONNECTION_MINUTES);
}

export function findFlightConnections(bookings: readonly FlightConnectionInput[]) {
  const flights = bookings.filter((booking) => booking.kind === 'flight');
  const arrivals = flights.flatMap((booking) => {
    const airportCode = booking.destinationCode.trim().toUpperCase();
    const epoch = endpointEpoch(booking, 'arrival');
    return airportCode && epoch !== null ? [{ booking, airportCode, epoch }] : [];
  });
  const departures = flights.flatMap((booking) => {
    const airportCode = booking.originCode.trim().toUpperCase();
    const epoch = endpointEpoch(booking, 'departure');
    return airportCode && epoch !== null ? [{ booking, airportCode, epoch }] : [];
  }).sort((left, right) => left.epoch - right.epoch);

  const usedArrivals = new Set<string>();
  const usedDepartures = new Set<string>();
  const connections: FlightConnection[] = [];
  const wouldCycle = (from: string, to: string) => {
    const visited = new Set([from]);
    let current: string | undefined = to;
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = connections.find((connection) => connection.arrivalBookingId === current)?.departureBookingId;
    }
    return false;
  };

  // Explicit choices win over automatic matching. An invalid/deleted manual
  // target remains unlinked until the user chooses again, never reassigned.
  for (const arrival of [...flights].sort((a, b) => a.id.localeCompare(b.id))) {
    if (arrival.connectionMode === 'none' || arrival.connectionMode === 'manual') usedArrivals.add(arrival.id);
    if (arrival.connectionMode !== 'manual' || !arrival.nextFlightId) continue;
    const departure = flights.find((booking) => booking.id === arrival.nextFlightId);
    if (!departure || usedDepartures.has(departure.id) || wouldCycle(arrival.id, departure.id)) continue;
    const connection = connectionBetween(arrival, departure);
    if (!connection) continue;
    usedDepartures.add(departure.id);
    connections.push(connection);
  }

  for (const departure of departures) {
    if (usedDepartures.has(departure.booking.id)) continue;
    const candidate = arrivals
      .filter((arrival) => arrival.booking.id !== departure.booking.id
        && !usedArrivals.has(arrival.booking.id)
        && !wouldCycle(arrival.booking.id, departure.booking.id)
        && arrival.airportCode === departure.airportCode)
      .map((arrival) => ({ arrival, durationMinutes: Math.round((departure.epoch - arrival.epoch) / 60000) }))
      .filter(({ durationMinutes }) => durationMinutes >= MIN_CONNECTION_MINUTES && durationMinutes <= MAX_CONNECTION_MINUTES)
      .sort((left, right) => left.durationMinutes - right.durationMinutes)[0];

    if (!candidate) continue;
    usedArrivals.add(candidate.arrival.booking.id);
    usedDepartures.add(departure.booking.id);
    const airport = findAirportByCode(departure.airportCode);
    connections.push({
      arrivalBookingId: candidate.arrival.booking.id,
      departureBookingId: departure.booking.id,
      airportCode: departure.airportCode,
      airportName: airport?.city || airport?.name || departure.airportCode,
      durationMinutes: candidate.durationMinutes,
      mode: 'auto',
    });
  }

  return connections;
}

export function formatConnectionDuration(durationMinutes: number) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (!hours) return `${minutes}分`;
  return `${hours}時間${minutes ? `${minutes}分` : ''}`;
}
