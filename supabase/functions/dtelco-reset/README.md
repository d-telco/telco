Deployed source is `index.ts` in this directory. It is a thin wrapper: a GET reports what a reset
would touch and the current segment counts without changing anything, and a POST calls the
Postgres function `dtelco_reset_demo()` defined in `supabase/migrations/0007`.

Kept as its own endpoint rather than a signal on `dtelco-operator`, because it is the one call
that undoes work: worth seeing on its own in a log, and worth not being reachable by mistyping a
signal name.
