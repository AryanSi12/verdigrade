-- Applied in every environment; never edit, add a new migration instead.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  status TEXT NOT NULL
);
