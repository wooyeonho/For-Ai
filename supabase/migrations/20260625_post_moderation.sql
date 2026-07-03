-- Moderation gate for user-submitted community posts.
--
-- Previously anonymous submissions were inserted directly as 'published' and
-- appeared on the site immediately (no review step). Now anonymous submissions
-- land as 'pending' and require an admin to approve them (set status='published')
-- via /admin/posts before they become public. Admin/AI posts created through the
-- service-role /api/admin/posts route continue to publish directly, since the
-- service role bypasses RLS. AI posts are reserved for admin/internal generation.
--
-- DEPLOY TOGETHER WITH THE APP CODE: the public POST /api/posts route must insert
-- status='pending' to satisfy the new anon INSERT policy. If this migration is
-- applied before the new code is deployed, anon inserts that still send
-- 'published' will be rejected by the policy.

-- 1. Allow 'pending' in the status domain (constraint is otherwise unchanged).
alter table community_posts drop constraint if exists community_posts_status_check;
alter table community_posts add constraint community_posts_status_check
  check (status in ('pending', 'published', 'hidden', 'spam', 'deleted'));

-- 2. New submissions default to pending review.
alter table community_posts alter column status set default 'pending';

-- 3. Anonymous callers may only insert pending posts (no self-publish).
drop policy if exists community_posts_public_insert on community_posts;
create policy community_posts_public_insert
  on community_posts for insert to anon
  with check (status = 'pending' and author_type = 'user');

-- The public SELECT policy already restricts anon reads to status='published',
-- so pending posts stay hidden until an admin approves them. (unchanged)
