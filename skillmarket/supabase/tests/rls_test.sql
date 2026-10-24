-- Behaviour tests for the SkillMarket schema. Any failed expectation raises an error and stops the run.
-- Run with: psql -v ON_ERROR_STOP=1 -f supabase/tests/stub_auth.sql -f supabase/migrations/0001_init.sql -f supabase/tests/rls_test.sql
create function public.expect_fail(q text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then return; end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', q;
end $$;
create function public.expect_eq(actual bigint, expected bigint, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAILED [%]: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  - %', label;
end $$;
create function public.rows_changed(q text) returns bigint language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on all functions in schema public to anon, authenticated;

-- ---- sign-ups create profiles ------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@uni.test', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@uni.test',   '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@uni.test', '{"full_name": "Carol"}');
select public.expect_eq((select count(*) from public.profiles), 3, 'profile created for every sign-up');
select public.expect_eq((select count(*) from public.profiles where full_name = 'Alice'), 1, 'profile gets the full name from sign-up metadata');

-- ---- skills ------------------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
insert into public.skills (id, owner_id, title, description, category, level, mode, kind)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
          'Python for beginners', 'I can teach Python basics step by step.', 'Programming', 'beginner', 'online', 'offer');
select public.expect_eq((select count(*) from public.skills), 1, 'owner can create a skill');
select public.expect_fail($q$ insert into public.skills (owner_id, title, description, category, level, mode, kind)
  values ('00000000-0000-0000-0000-00000000000b', 'Not mine here', 'Pretending to be Bob right now.', 'Other', 'beginner', 'online', 'offer') $q$);
select public.expect_fail($q$ insert into public.skills (owner_id, title, description, category, level, mode, kind)
  values ('00000000-0000-0000-0000-00000000000a', 'ab', 'too short title should fail', 'Other', 'beginner', 'online', 'offer') $q$);

reset role;
set request.jwt.claim.sub = '';          -- anonymous requests carry no user id
set role anon;
select public.expect_eq((select count(*) from public.skills), 1, 'anonymous visitors can browse skills');
select public.expect_fail($q$ insert into public.skills (owner_id, title, description, category, level, mode, kind)
  values ('00000000-0000-0000-0000-00000000000a', 'Anon skill', 'Anonymous users cannot post skills.', 'Other', 'beginner', 'online', 'offer') $q$);

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select public.expect_eq(public.rows_changed($q$ update public.skills set title = 'Hijacked title' $q$), 0, 'other users cannot edit a skill');
select public.expect_eq(public.rows_changed($q$ delete from public.skills $q$), 0, 'other users cannot delete a skill');

-- ---- requests ----------------------------------------------------------------------------------
-- Bob requests Alice's skill, lying about the owner and the status: the trigger corrects both.
insert into public.exchange_requests (id, skill_id, requester_id, owner_id, message, status)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Could you teach me Python?', 'accepted');
select public.expect_eq((select count(*) from public.exchange_requests where owner_id = '00000000-0000-0000-0000-00000000000a' and status = 'pending'), 1,
  'request owner and status are set by the database, not the client');
select public.expect_fail($q$ insert into public.exchange_requests (skill_id, requester_id, owner_id, message)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'Second pending request') $q$);
select public.expect_fail($q$ insert into public.exchange_requests (skill_id, requester_id, owner_id, message)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Pretend to be Alice') $q$);

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select public.expect_fail($q$ insert into public.exchange_requests (skill_id, requester_id, owner_id, message)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Request my own skill') $q$);
select public.expect_eq((select count(*) from public.exchange_requests), 1, 'owner sees the request');

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set role authenticated;
select public.expect_eq((select count(*) from public.exchange_requests), 0, 'strangers cannot see other people''s requests');

-- ---- status transitions -----------------------------------------------------------------------
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select public.expect_fail($q$ update public.exchange_requests set status = 'accepted' $q$);          -- requester cannot accept
select public.expect_fail($q$ update public.exchange_requests set message = 'edited message' $q$);   -- content is frozen
select public.expect_fail($q$ update public.exchange_requests set status = 'completed' $q$);         -- cannot skip steps

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
update public.exchange_requests set status = 'accepted';
select public.expect_eq((select count(*) from public.exchange_requests where status = 'accepted'), 1, 'owner can accept');
select public.expect_fail($q$ update public.exchange_requests set status = 'pending' $q$);           -- no going back

-- ---- reviews ----------------------------------------------------------------------------------
select public.expect_fail($q$ insert into public.reviews (request_id, reviewer_id, reviewee_id, rating)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 5) $q$);  -- not completed yet
update public.exchange_requests set status = 'completed';
select public.expect_eq((select count(*) from public.exchange_requests where status = 'completed'), 1, 'either party can complete an accepted exchange');
insert into public.reviews (request_id, reviewer_id, reviewee_id, rating, comment)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 4, 'Great learner');
select public.expect_fail($q$ insert into public.reviews (request_id, reviewer_id, reviewee_id, rating)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 5) $q$);  -- only one review each
select public.expect_fail($q$ insert into public.reviews (request_id, reviewer_id, reviewee_id, rating)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 5) $q$);  -- not about yourself

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set role authenticated;
select public.expect_fail($q$ insert into public.reviews (request_id, reviewer_id, reviewee_id, rating)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 1) $q$);  -- outsiders cannot review

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
insert into public.reviews (request_id, reviewer_id, reviewee_id, rating, comment)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 5, 'Clear teacher');
select public.expect_fail($q$ insert into public.reviews (request_id, reviewer_id, reviewee_id, rating)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 9) $q$);  -- rating range

reset role;
set request.jwt.claim.sub = '';
set role anon;
select public.expect_eq((select count(*) from public.reviews), 2, 'reviews are public');
select public.expect_eq((select review_count from public.profile_ratings where reviewee_id = '00000000-0000-0000-0000-00000000000a'), 1, 'rating summary view counts reviews');
select public.expect_eq((select (avg_rating * 100)::bigint from public.profile_ratings where reviewee_id = '00000000-0000-0000-0000-00000000000a'), 500, 'rating summary view averages ratings');

-- ---- profile editing --------------------------------------------------------------------------
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select public.expect_eq(public.rows_changed($q$ update public.profiles set bio = 'CS student' where id = '00000000-0000-0000-0000-00000000000b' $q$), 1, 'users can edit their own profile');
select public.expect_eq(public.rows_changed($q$ update public.profiles set bio = 'hacked' where id = '00000000-0000-0000-0000-00000000000a' $q$), 0, 'users cannot edit other profiles');

reset role;
drop function public.expect_fail(text);
drop function public.expect_eq(bigint, bigint, text);
drop function public.rows_changed(text);
select 'ALL DATABASE TESTS PASSED' as result;
