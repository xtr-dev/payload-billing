# Claude Workflow Permissions

This document explains how to configure user permissions for Claude automation workflows.

## Current Configuration

### Issue Implementation Workflow
- **Strategy**: `adminOrPrivileged` - Repository admins OR privileged users
- **Privileged Users**: `bastiaan`, `xtr-dev-team`
- **Access Check**: Validates permissions before any Claude implementation

### Code Review Workflow
- **Strategy**: `privilegedUsers` - Only users in privileged list
- **Applies to**: Pull request reviews
- **Scope**: PRs created by privileged users only

## Permission Strategies

### 1. Privileged Users Only
```javascript
const isAllowed = privilegedUsers.includes(username);
```
- Most restrictive
- Only specific users can use Claude
- Best for sensitive repositories

### 2. Admins Only
```javascript
const isAllowed = collaborator.permission === 'admin';
```
- Repository administrators only
- Automatic based on GitHub permissions
- Good for small teams

### 3. Admin OR Privileged (Current)
```javascript
const isAllowed = hasAdminAccess || isPrivilegedUser;
```
- Repository admins OR users in privileged list
- Flexible access control
- **Currently active strategy**

### 4. Organization Members with Write Access
```javascript
const isAllowed = isOrgMember && hasWriteAccess;
```
- Organization members with write/admin permissions
- Good for larger organizations

### 5. Everyone with Access
```javascript
const isAllowed = hasWriteAccess;
```
- Any collaborator with write access
- Least restrictive option

## How to Change Permissions

### Option A: Edit Privileged Users List
1. Open `.github/workflows/claude-implement-issue.yml`
2. Find the `privilegedUsers` array (line ~32)
3. Add or remove usernames:
```javascript
const privilegedUsers = [
  'bastiaan',
  'xtr-dev-team',
  'new-user',        // Add new users here
  'another-user'
];
```

### Option B: Change Permission Strategy
1. Open `.github/workflows/claude-implement-issue.yml`
2. Find line ~77: `const isAllowed = allowedByAdminOrPrivileged;`
3. Replace with your preferred strategy:
```javascript
// Only privileged users
const isAllowed = allowedByUserList;

// Only admins
const isAllowed = allowedByAdminAccess;

// Admin + privileged users (current)
const isAllowed = allowedByAdminOrPrivileged;

// Organization members with write access
const isAllowed = allowedByOrgAndWrite;
```

### Option C: Custom Logic
Add your own permission logic:
```javascript
// Example: Allow specific teams
const allowedTeams = ['core-team', 'senior-devs'];
const userTeams = await github.rest.teams.listForUser({
  org: context.repo.owner,
  username: username
});
const isInAllowedTeam = userTeams.data.some(team =>
  allowedTeams.includes(team.slug)
);

const isAllowed = hasAdminAccess || isInAllowedTeam;
```

## Code Review Permissions

The code review workflow uses a simpler approach with GitHub's built-in author associations:

```yaml
if: |
  contains(fromJSON('["bastiaan", "xtr-dev-team"]'), github.event.pull_request.user.login) ||
  github.event.pull_request.author_association == 'OWNER' ||
  github.event.pull_request.author_association == 'MEMBER'
```

### Author Associations:
- `OWNER` - Repository owner
- `MEMBER` - Organization member
- `COLLABORATOR` - Repository collaborator
- `CONTRIBUTOR` - Has contributed to the repository
- `FIRST_TIME_CONTRIBUTOR` - First-time contributor
- `NONE` - No association

## Testing Permissions

### Test Access for a User
1. Create a test issue
2. Have the user comment `@claude implement`
3. Check the workflow logs for permission results

### Debug Permission Issues
1. Go to **Actions** tab
2. Click on the failed workflow run
3. Expand "Check user permissions" step
4. Review the permission details in logs

## Error Messages

### Access Denied
```
❌ Access Denied: Claude implementation is restricted to privileged users only.

Your access level: write
Privileged user: No
Organization member: Yes

Contact a repository administrator for access.
```

### Permission Details
The error message shows:
- Current repository permission level
- Whether user is in privileged list
- Organization membership status

## Security Considerations

### Best Practices
1. **Start Restrictive**: Begin with privileged users only
2. **Regular Audits**: Review privileged user list regularly
3. **Monitor Usage**: Check workflow logs for unexpected access attempts
4. **Team-based Access**: Consider using GitHub teams for larger organizations

### Risks
- **Over-permissive**: Too many users can increase costs and misuse
- **Under-permissive**: Blocks legitimate development work
- **Stale Permissions**: Former team members with lingering access

## Configuration Examples

### Small Team (2-5 developers)
```javascript
const privilegedUsers = ['owner', 'lead-dev'];
const isAllowed = allowedByAdminOrPrivileged;
```

### Medium Team (5-15 developers)
```javascript
const privilegedUsers = ['owner', 'lead-dev', 'senior-dev1', 'senior-dev2'];
const isAllowed = allowedByAdminOrPrivileged;
```

### Large Organization
```javascript
// Use organization membership + write access
const isAllowed = allowedByOrgAndWrite;
```

### Open Source Project
```javascript
// Only maintainers
const privilegedUsers = ['maintainer1', 'maintainer2'];
const isAllowed = allowedByUserList;
```

## Troubleshooting

### Common Issues
1. **User not in list**: Add username to `privilegedUsers` array
2. **Wrong permission level**: User needs write access minimum
3. **Organization issues**: Verify org membership if using org-based permissions
4. **Case sensitivity**: Usernames are case-sensitive

### Quick Fixes
- **Add user**: Edit workflow file, add to privileged users
- **Temporary access**: Change strategy to `allowedByAdminAccess` temporarily
- **Emergency access**: Repository admins always have access with `adminOrPrivileged` strategy

---

**Note**: Changes to workflow files require a commit to take effect. Test permissions after any modifications.