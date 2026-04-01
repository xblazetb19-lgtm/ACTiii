-- ══════════════════════════════════════════════════════
--   ACT-III — SUPABASE DATABASE SETUP
--   Run this entire script in: Supabase > SQL Editor
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. TABLES
-- ─────────────────────────────────────────

-- PROFILES
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade unique not null,
  display_name text not null,
  access_code  text unique not null,
  stats_json   jsonb default '{}'::jsonb,
  created_at   timestamptz default now()
);

-- ARTISTS
create table if not exists artists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  cover_url  text,
  bio        text,
  created_at timestamptz default now()
);

-- ALBUMS
create table if not exists albums (
  id         uuid primary key default gen_random_uuid(),
  artist_id  uuid references artists(id) on delete cascade not null,
  title      text not null,
  cover_url  text,
  year       int,
  genre      text,
  created_at timestamptz default now()
);

-- SONGS
create table if not exists songs (
  id           uuid primary key default gen_random_uuid(),
  album_id     uuid references albums(id) on delete cascade not null,
  title        text not null,
  audio_url    text,
  cover_url    text,   -- overrides album cover if set
  duration_sec int,
  track_number int,
  genre        text,
  created_at   timestamptz default now()
);

-- FAVORITES
create table if not exists favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  type       text not null check (type in ('song', 'album')),
  item_id    uuid not null,
  created_at timestamptz default now(),
  unique(user_id, type, item_id)
);

-- HISTORY
create table if not exists history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  song_id     uuid references songs(id) on delete cascade not null,
  listened_at timestamptz default now()
);

-- PLAYLISTS
create table if not exists playlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  cover_url  text,
  created_at timestamptz default now()
);

-- PLAYLIST SONGS (join table)
create table if not exists playlist_songs (
  id          uuid primary key default gen_random_uuid(),
  playlist_id uuid references playlists(id) on delete cascade not null,
  song_id     uuid references songs(id) on delete cascade not null,
  position    int default 0,
  added_at    timestamptz default now(),
  unique(playlist_id, song_id)
);

-- ─────────────────────────────────────────
-- 2. INDEXES (performance)
-- ─────────────────────────────────────────
create index if not exists idx_songs_album    on songs(album_id);
create index if not exists idx_albums_artist  on albums(artist_id);
create index if not exists idx_history_user   on history(user_id);
create index if not exists idx_history_date   on history(listened_at desc);
create index if not exists idx_favorites_user on favorites(user_id);
create index if not exists idx_playlists_user on playlists(user_id);

-- ─────────────────────────────────────────
-- 3. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────

-- Enable RLS on all tables
alter table profiles       enable row level security;
alter table artists        enable row level security;
alter table albums         enable row level security;
alter table songs          enable row level security;
alter table favorites      enable row level security;
alter table history        enable row level security;
alter table playlists      enable row level security;
alter table playlist_songs enable row level security;

-- ── PROFILES ──
-- Users can read any profile (for social features)
create policy "profiles_read_all"
  on profiles for select using (true);

-- Users can only insert/update their own profile
create policy "profiles_write_own"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = user_id);

-- ── ARTISTS — public read, auth write ──
create policy "artists_read_all"
  on artists for select using (true);

create policy "artists_insert_auth"
  on artists for insert
  with check (auth.role() = 'authenticated');

-- ── ALBUMS — public read, auth write ──
create policy "albums_read_all"
  on albums for select using (true);

create policy "albums_insert_auth"
  on albums for insert
  with check (auth.role() = 'authenticated');

-- ── SONGS — public read, auth write ──
create policy "songs_read_all"
  on songs for select using (true);

create policy "songs_insert_auth"
  on songs for insert
  with check (auth.role() = 'authenticated');

-- ── FAVORITES — private per user ──
create policy "favorites_read_own"
  on favorites for select
  using (auth.uid() = user_id);

create policy "favorites_insert_own"
  on favorites for insert
  with check (auth.uid() = user_id);

create policy "favorites_delete_own"
  on favorites for delete
  using (auth.uid() = user_id);

-- ── HISTORY — private per user ──
create policy "history_read_own"
  on history for select
  using (auth.uid() = user_id);

create policy "history_insert_own"
  on history for insert
  with check (auth.uid() = user_id);

-- ── PLAYLISTS — private per user ──
create policy "playlists_read_own"
  on playlists for select
  using (auth.uid() = user_id);

create policy "playlists_insert_own"
  on playlists for insert
  with check (auth.uid() = user_id);

create policy "playlists_update_own"
  on playlists for update
  using (auth.uid() = user_id);

create policy "playlists_delete_own"
  on playlists for delete
  using (auth.uid() = user_id);

-- ── PLAYLIST SONGS ──
create policy "playlist_songs_read_own"
  on playlist_songs for select
  using (
    exists (
      select 1 from playlists
      where playlists.id = playlist_songs.playlist_id
      and playlists.user_id = auth.uid()
    )
  );

create policy "playlist_songs_insert_own"
  on playlist_songs for insert
  with check (
    exists (
      select 1 from playlists
      where playlists.id = playlist_songs.playlist_id
      and playlists.user_id = auth.uid()
    )
  );

create policy "playlist_songs_delete_own"
  on playlist_songs for delete
  using (
    exists (
      select 1 from playlists
      where playlists.id = playlist_songs.playlist_id
      and playlists.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- 4. SAMPLE DATA (optional — delete if not needed)
-- ─────────────────────────────────────────

-- Sample artist
insert into artists (name, cover_url) values
  ('Artist Demo', 'https://picsum.photos/seed/artist1/300/300'),
  ('Sample Band', 'https://picsum.photos/seed/band1/300/300')
on conflict do nothing;

-- Sample albums
insert into albums (artist_id, title, cover_url, year, genre)
select id, 'Premier Album', 'https://picsum.photos/seed/album1/300/300', 2023, 'Pop'
from artists where name = 'Artist Demo' limit 1
on conflict do nothing;

insert into albums (artist_id, title, cover_url, year, genre)
select id, 'Best Of', 'https://picsum.photos/seed/album2/300/300', 2024, 'Rock'
from artists where name = 'Sample Band' limit 1
on conflict do nothing;

-- Sample songs
insert into songs (album_id, title, duration_sec, track_number)
select id, 'Titre 1', 210, 1 from albums where title = 'Premier Album' limit 1
on conflict do nothing;

insert into songs (album_id, title, duration_sec, track_number)
select id, 'Titre 2', 185, 2 from albums where title = 'Premier Album' limit 1
on conflict do nothing;

insert into songs (album_id, title, duration_sec, track_number)
select id, 'Titre 3', 240, 3 from albums where title = 'Premier Album' limit 1
on conflict do nothing;

insert into songs (album_id, title, duration_sec, track_number)
select id, 'Top Track', 198, 1 from albums where title = 'Best Of' limit 1
on conflict do nothing;

-- ══════════════════════════════════════════
-- ✅ DONE! Your Act-III database is ready.
-- ══════════════════════════════════════════
