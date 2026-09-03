-- Per-user vendor connections. api_key is stored server-side and MUST never be
-- selected in list/read queries returned to the client (use has_key instead).
create table if not exists connections (
  id               serial primary key,
  user_id          text not null,
  connector_id     text not null,
  account          text not null default '',
  endpoint         text not null,
  api_key          text,
  mode             text not null default 'sandbox',
  status           text not null default 'connected',
  last_sync_at     timestamptz,
  last_error       text,
  invoices_pulled  integer not null default 0,
  gates_pulled     integer not null default 0,
  connected_at     timestamptz not null default now(),
  unique (user_id, connector_id)
);

create index if not exists connections_user_id_idx on connections (user_id);
