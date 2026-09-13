CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT '',
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS trip_members (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'editor')),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '予定',
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  confirmation_code TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS bookings_trip_day ON bookings(trip_id, day, time);

CREATE TABLE IF NOT EXISTS packing_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1 AND quantity <= 99),
  packed INTEGER NOT NULL DEFAULT 0 CHECK(packed IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS packing_items_trip ON packing_items(trip_id, packed, category, name);

CREATE TABLE IF NOT EXISTS travel_tasks (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_on TEXT NOT NULL DEFAULT '',
  assignee TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS travel_tasks_trip ON travel_tasks(trip_id, done, due_on, title);

CREATE TABLE IF NOT EXISTS booking_details (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  origin TEXT NOT NULL DEFAULT '',
  origin_code TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT '',
  destination_code TEXT NOT NULL DEFAULT '',
  end_day TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS booking_documents (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size >= 1 AND size <= 20971520),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS booking_documents_trip ON booking_documents(trip_id, booking_id, created_at);

CREATE TABLE IF NOT EXISTS flight_connection_preferences (
  arrival_booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  departure_booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK(mode IN ('manual', 'none')),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(arrival_booking_id != departure_booking_id),
  CHECK(mode = 'manual' OR departure_booking_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS flight_connection_departure
  ON flight_connection_preferences(departure_booking_id) WHERE departure_booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  consumed_by TEXT REFERENCES users(id),
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES itinerary_items(id) ON DELETE SET NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);


-- Purge data left by the discontinued Gmail import feature.
DROP TABLE IF EXISTS gmail_message_cache;
DROP TABLE IF EXISTS gmail_scan_limits;
DROP TABLE IF EXISTS gmail_oauth_states;
DROP TABLE IF EXISTS gmail_connections;
DROP TABLE IF EXISTS booking_imports;

CREATE TABLE IF NOT EXISTS trip_covers (
  trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  image TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  opening_hours TEXT NOT NULL DEFAULT '',
  reservation_status TEXT NOT NULL DEFAULT 'not_needed' CHECK(reservation_status IN ('not_needed','needed','requested','confirmed')),
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'want' CHECK(status IN ('want','planned','visited','skipped')),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS places_trip ON places(trip_id, status, updated_at);

CREATE TABLE IF NOT EXISTS place_itinerary_links (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES itinerary_items(id) ON DELETE SET NULL
);
-- Recover only unambiguous legacy additions. Keep a row even after deletion,
-- so subsequent schema runs cannot associate a place with another plan.
INSERT OR IGNORE INTO place_itinerary_links (place_id, item_id)
SELECT p.id, (
  SELECT i.id FROM itinerary_items i
  WHERE i.trip_id = p.trip_id AND i.kind = '予定' AND i.time = ''
    AND i.title = p.title
    AND i.note = p.note || CASE WHEN p.note <> '' AND p.location <> '' THEN char(10) ELSE '' END || p.location
    AND (SELECT COUNT(*) FROM places other WHERE other.trip_id = p.trip_id AND other.title = p.title
      AND other.note = p.note AND other.location = p.location) = 1
  GROUP BY i.trip_id HAVING COUNT(*) = 1
) FROM places p;

-- Extend place metadata without rebuilding existing rows or their status constraint.
CREATE TABLE IF NOT EXISTS place_details (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  reference_links TEXT NOT NULL DEFAULT '[]',
  reservation_status TEXT CHECK(reservation_status IS NULL OR reservation_status = 'unavailable')
);

-- Add read-only membership without rebuilding the existing member table.
CREATE TABLE IF NOT EXISTS trip_member_permissions (
  trip_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_only INTEGER NOT NULL DEFAULT 1 CHECK(read_only IN (0, 1)),
  PRIMARY KEY (trip_id, user_id),
  FOREIGN KEY (trip_id, user_id) REFERENCES trip_members(trip_id, user_id) ON DELETE CASCADE
);

-- Separate profile metadata keeps the repeatable schema safe on existing databases.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url TEXT
);

-- Optional location metadata preserves existing booking rows and repeatable deployment.
CREATE TABLE IF NOT EXISTS booking_locations (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT ''
);
