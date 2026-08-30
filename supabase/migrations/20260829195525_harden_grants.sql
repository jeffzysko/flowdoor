revoke all on function touch_updated_at()        from public, anon, authenticated;
revoke all on function handle_new_user()         from public, anon, authenticated;
revoke all on function faces_inherit_org()       from public, anon, authenticated;
revoke all on function bookings_set_exclusive()  from public, anon, authenticated;

revoke all on function next_order_code(uuid)     from public, anon, authenticated;
revoke all on function expire_stale_holds()      from public, anon, authenticated;

revoke all on function is_platform_admin()                       from public, anon;
revoke all on function my_org_ids()                              from public, anon;
revoke all on function readable_org_ids()                        from public, anon;
revoke all on function is_org_member(uuid)                       from public, anon;
revoke all on function has_org_role(uuid, member_role[])         from public, anon;

grant execute on function is_platform_admin()               to authenticated;
grant execute on function my_org_ids()                      to authenticated;
grant execute on function readable_org_ids()                to authenticated;
grant execute on function is_org_member(uuid)               to authenticated;
grant execute on function has_org_role(uuid, member_role[]) to authenticated;

revoke all on function bootstrap_platform_admin() from public, anon;
revoke all on function accept_invitation(text)    from public, anon;
revoke all on function create_invitation(uuid, text, text, member_role) from public, anon;
revoke all on function create_organization(text, org_kind, text, text, text, text, text, text, char, text) from public, anon;
revoke all on function create_order_with_items(uuid, uuid, date, date, text, text, jsonb) from public, anon;
revoke all on function field_start(uuid, text, numeric, numeric, numeric, text) from public, anon;
revoke all on function field_finish(uuid, text, numeric, numeric, text, text)  from public, anon;
revoke all on function publish_proof(uuid) from public, anon;

grant execute on function bootstrap_platform_admin() to authenticated;
grant execute on function accept_invitation(text)    to authenticated;
grant execute on function create_invitation(uuid, text, text, member_role) to authenticated;
grant execute on function create_organization(text, org_kind, text, text, text, text, text, text, char, text) to authenticated;
grant execute on function create_order_with_items(uuid, uuid, date, date, text, text, jsonb) to authenticated;
grant execute on function field_start(uuid, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function field_finish(uuid, text, numeric, numeric, text, text)  to authenticated;
grant execute on function publish_proof(uuid) to authenticated;

revoke all on function get_public_proof(text) from public;
grant execute on function get_public_proof(text) to anon, authenticated;
