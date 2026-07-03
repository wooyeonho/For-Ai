-- Reserve author_type='ai' community posts for admin/internal generation only.
-- Public anonymous forms may submit only user-authored posts for moderation.

drop policy if exists community_posts_public_insert on community_posts;
create policy community_posts_public_insert
  on community_posts for insert to anon
  with check (status = 'pending' and author_type = 'user');
