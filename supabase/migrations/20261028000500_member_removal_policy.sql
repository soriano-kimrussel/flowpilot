-- Only owners may remove admins (matches update_member_role). Admins may remove members;
-- anyone except the owner may leave.
drop policy if exists "members: admins remove non-owners, users leave" on public.workspace_members;

create policy "members: admins remove members, owners remove admins, users leave"
  on public.workspace_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (
      user_id = (select auth.uid())
      or private.has_workspace_role(workspace_id, array['owner'])
      or (role = 'member' and private.has_workspace_role(workspace_id, array['owner', 'admin']))
    )
  );
