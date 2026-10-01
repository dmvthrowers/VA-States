-- VSYC-26 Storage bucket for competitor music files.
-- Run after 0001_initial_schema.sql.
-- Max 128 MB per file; private bucket (service role only).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vsyc26-music',
  'vsyc26-music',
  false,
  134217728,
  array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a']
);

-- Only service role can read/write music files
create policy "service_role_music" on storage.objects
  for all using (auth.role() = 'service_role' and bucket_id = 'vsyc26-music');
