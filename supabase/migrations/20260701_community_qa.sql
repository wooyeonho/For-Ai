-- Add Q&A structure to community_posts (지식iN pattern)
-- question_type classifies posts; resolved_at + accepted_reply_id mark answered questions

alter table community_posts
  add column if not exists question_type text
    check (question_type in ('question', 'discussion', 'report') or question_type is null),
  add column if not exists resolved_at timestamptz,
  add column if not exists accepted_reply_id uuid references community_posts(id) on delete set null;

comment on column community_posts.question_type is 'question=사용자 질문, discussion=일반 토론, report=오류 신고. null=기존 posts와 동일';
comment on column community_posts.resolved_at is '질문이 답변 완료된 시각 (question_type=question 일 때만 사용)';
comment on column community_posts.accepted_reply_id is '채택된 답변 post id';

create index if not exists idx_community_posts_question_type on community_posts(question_type) where question_type is not null;
create index if not exists idx_community_posts_resolved on community_posts(resolved_at) where resolved_at is not null;
