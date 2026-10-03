-- Fitness Journey: chạy MỘT LẦN trong Supabase → SQL Editor → Run.
-- Tạo bảng dữ liệu + kho ảnh, và khoá lại để mỗi tài khoản chỉ đọc/ghi được dữ liệu của chính mình.

-- 1. Bảng dữ liệu: mỗi mục (số đo một tuần, cân một ngày, một buổi tập...) là một dòng
create table public.entries (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index entries_user_updated_idx on public.entries (user_id, updated_at);

-- updated_at luôn lấy giờ máy chủ để các máy biết dòng nào mới
create or replace function public.entries_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger entries_touch before insert or update on public.entries
  for each row execute function public.entries_touch();

-- 2. Phân quyền: chưa đăng nhập thì không thấy gì, đăng nhập rồi chỉ thấy dòng của mình
alter table public.entries enable row level security;
revoke all on public.entries from anon;
grant select, insert, update, delete on public.entries to authenticated;
create policy entries_owner on public.entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 3. Kho ảnh riêng tư: mỗi tài khoản một thư mục mang id của mình
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
create policy photos_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
