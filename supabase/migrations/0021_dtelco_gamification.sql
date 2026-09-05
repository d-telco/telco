-- Gamification stand in: the pocket and the wins. Applied to the shared project on
-- 5 September 2026 as dtelco_gamification_pocket_and_wins; kept here so the repository carries
-- every object it relies on. New dtelco_ objects only, nothing altered.
--
-- dtelco_coupon_pocket holds real codes from the account's own coupon list, inserted by the
-- account owner from the panel. The site never mints a code: dtelco-coupons only reads the list,
-- so a code is handed out only when this pocket holds one the platform already issued. A row is
-- marked used when a game win takes it, and never deleted.
--
-- dtelco_game_win is one row per win: which game, where, what prize, and which pocket code, if
-- any, went with it. simulated true like every row this demonstration creates.
create table if not exists dtelco_coupon_pocket (
  code text primary key,
  note text,
  used_by text,
  used_at timestamptz
);

create table if not exists dtelco_game_win (
  id bigint generated always as identity primary key,
  contact_key text not null,
  game text not null,
  placement text,
  prize text,
  coupon_code text references dtelco_coupon_pocket(code),
  simulated boolean not null default true,
  created_at timestamptz not null default now()
);

alter table dtelco_coupon_pocket enable row level security;
alter table dtelco_game_win enable row level security;
-- No policies on purpose: only the service role behind dtelco-games touches these. They are not
-- offered as Dengage remote sources, so the dengage_reader read policy rule does not apply.
