CREATE TABLE profiles (
  role TEXT PRIMARY KEY CHECK (role IN ('blue', 'pink')),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  author_role TEXT NOT NULL REFERENCES profiles(role),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  photo_key TEXT,
  photo_type TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX memories_order ON memories(created_at, id);
--> statement-breakpoint
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  author_role TEXT NOT NULL REFERENCES profiles(role),
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE login_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
