CREATE UNIQUE INDEX IF NOT EXISTS users_username_case_insensitive ON users (lower(username));
