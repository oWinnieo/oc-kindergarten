\set ON_ERROR_STOP on

select
  'organization' as check_name,
  o.name,
  o.default_application,
  o.is_profile_public,
  o.use_email_as_username
from organization as o
where o.owner = 'admin'
  and o.name = 'OCKindergarten';

select
  'application' as check_name,
  a.name,
  a.organization,
  a.default_group,
  a.is_shared,
  a.enable_sign_up,
  a.redirect_uris
from application as a
where a.owner = 'admin'
  and a.name = 'oc-kindergarten';

select
  'organization_user_count' as check_name,
  expected.owner,
  count(u.name) as user_count
from (
  values ('OCKindergarten'), ('RococoOrg')
) as expected(owner)
left join "user" as u on u.owner = expected.owner
group by expected.owner
order by expected.owner;
