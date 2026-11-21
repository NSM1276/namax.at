-- Venue pages: facts, owner changes, chat, photos, events and visits.
-- Apply once: psql "$DATABASE_URL" -f api/_lib/venues/schema.sql  (or paste into the Neon SQL editor)

create table if not exists venues (
  slug            text primary key,
  key_hash        text not null,
  status          text not null default 'hidden' check (status in ('hidden', 'public', 'removed')),
  facts           jsonb not null,
  changes         jsonb not null default '{}',
  pending         jsonb,
  confirmed_at    timestamptz,
  do_not_contact  boolean not null default false,
  chat_state      jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists venue_messages (
  id       bigserial primary key,
  slug     text not null references venues(slug) on delete cascade,
  role     text not null check (role in ('owner', 'assistant')),
  content  text not null,
  at       timestamptz not null default now()
);
create index if not exists venue_messages_slug on venue_messages (slug, id);

create table if not exists venue_photos (
  id    bigserial primary key,
  slug  text not null references venues(slug) on delete cascade,
  url   text not null,
  kind  text not null check (kind in ('show', 'priceboard')),
  at    timestamptz not null default now()
);
create index if not exists venue_photos_slug on venue_photos (slug, id);

create table if not exists venue_events (
  id    bigserial primary key,
  slug  text not null references venues(slug) on delete cascade,
  type  text not null,
  text  text not null default '',
  at    timestamptz not null default now()
);
create index if not exists venue_events_at on venue_events (at);
create index if not exists venue_events_slug on venue_events (slug, id);

create table if not exists venue_hits (
  slug      text not null references venues(slug) on delete cascade,
  day       date not null,
  visitors  int not null default 0,
  owner     int not null default 0,
  primary key (slug, day)
);

create table if not exists venue_model_calls (
  id    bigserial primary key,
  slug  text not null references venues(slug) on delete cascade,
  at    timestamptz not null default now()
);
create index if not exists venue_model_calls_slug on venue_model_calls (slug, at);

-- Owner key sealed with the admin key (AES-GCM), so the private list can show owner links; null for older rows.
alter table venues add column if not exists owner_key_enc text;

-- Photo of the venue's front, added by Nasim from the private list (Blob url); null when there is none.
alter table venues add column if not exists facade_url text;

-- The owner chat works only for venues Nasim opened it for after talking to the owner.
alter table venues add column if not exists chat_open boolean not null default false;

-- Requests from the "Sind Sie der Inhaber?" form; deleted 90 days after done, open ones after 180 days.
create table if not exists venue_requests (
  id       bigserial primary key,
  slug     text not null references venues(slug) on delete cascade,
  role     text not null check (role in ('owner', 'staff', 'other')),
  wish     text not null check (wish in ('fix', 'photos', 'website', 'remove')),
  name     text not null default '',
  phone    text not null,
  channel  text not null check (channel in ('call', 'whatsapp')),
  text     text not null default '',
  at       timestamptz not null default now(),
  done_at  timestamptz
);
create index if not exists venue_requests_open on venue_requests (done_at, at);
create index if not exists venue_requests_slug on venue_requests (slug, at);
