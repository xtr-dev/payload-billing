# Claude Issue Implementation Automation

This repository includes GitHub workflow automation that allows Claude to implement issues automatically when requested via issue comments.

## How to Use

### 1. Trigger Implementation

Comment on any open issue with one of these triggers:
- `@claude implement`
- `@claude fix`
- `@claude create`

**Example:**
```
@claude implement

Please add TypeScript support for the billing configuration options.
```

### 2. What Happens

When you trigger the automation:

1. **Permission Check**: Verifies you have write access to the repository
2. **Branch Creation**: Creates a new branch under `claude/issue-{number}-{timestamp}`
3. **Implementation**: Claude analyzes the issue and implements the requested changes using the official Anthropic Claude Code action
4. **Pull Request**: Automatically creates a PR with the implementation
5. **Notification**: Updates the issue with progress and results

### 3. Branch Naming Convention

Branches are created with the pattern:
```
claude/issue-{issue-number}-{timestamp}
```

**Examples:**
- `claude/issue-123-20241218-143052`
- `claude/issue-456-20241218-151234`

### 4. Requirements

#### Repository Setup
- The workflow must be merged into your default branch (usually `main` or `dev`)
- Required GitHub secrets:
  - `CLAUDE_CODE_OAUTH_TOKEN` - Your Claude Code OAuth token for implementation

#### Issue Requirements
- Issue must be **open**
- Issue should have clear, actionable requirements
- Include relevant context, code examples, or specifications

#### User Permissions
- Only users with **write access** or higher can trigger implementations
- This includes repository collaborators, maintainers, and owners

## Examples

### Good Issue for Implementation
```markdown
## Feature Request: Add Invoice PDF Export

**Description**: Users should be able to export invoices as PDF files

**Requirements**:
- Add "Export PDF" button to invoice detail page
- Generate PDF using existing invoice data
- Include company logo and styling
- Support both individual and bulk export

**Acceptance Criteria**:
- [ ] PDF export button appears on invoice page
- [ ] Generated PDF matches invoice design
- [ ] Bulk export works from invoice list
- [ ] Error handling for failed exports
```

### Trigger Comment
```
@claude implement

Please implement the PDF export feature as described in the issue. Make sure to follow the existing code patterns and add appropriate tests.
```

## Workflow Features

### ✅ Automated Branch Management
- Creates unique branches for each implementation
- Cleans up branches if no changes are made
- Prevents branch name conflicts

### ✅ Permission Control
- Validates user has write access before proceeding
- Provides clear error messages for unauthorized users

### ✅ Progress Tracking
- Real-time updates in issue comments
- Links to workflow execution logs
- Clear success/failure notifications

### ✅ Quality Assurance
- Uses official Anthropic Claude Code action
- Follows existing code patterns
- Includes appropriate documentation
- Maintains project coding standards
- Runs build, typecheck, and lint commands

## Troubleshooting

### Implementation Failed
If the workflow fails:
1. Check the [Actions tab](../../actions) for detailed logs
2. Verify the issue has clear, actionable requirements
3. Ensure repository permissions are configured correctly
4. Check that `CLAUDE_CODE_OAUTH_TOKEN` secret is set
5. Try again with more specific requirements

### No Changes Made
If Claude determines no changes are needed:
- The issue might already be implemented
- Requirements may need clarification
- The request might not be actionable as code

### Permission Denied
If you get permission errors:
- Verify you have write access to the repository
- Contact a repository maintainer for access
- Check if you're commenting on the correct repository

## Advanced Usage

### Multiple Implementations
You can request multiple implementations on the same issue:
- Each trigger creates a new branch
- Previous implementations remain available
- Latest implementation gets priority

### Custom Instructions
Provide specific implementation guidance:
```
@claude implement

Use the Stripe API for payment processing. Follow the existing payment provider pattern in src/providers/. Make sure to add proper error handling and webhook support.
```

### Review Process
All implementations create pull requests that:
- Reference the original issue
- Include detailed implementation notes
- Require manual review before merging
- Follow standard PR review process

## Configuration

### Required Secrets
Add these secrets in repository settings:

| Secret | Description | Required |
|--------|-------------|----------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code OAuth token for implementation | Yes |

### Workflow Permissions
The workflow requires these permissions:
- `contents: write` - Create branches and commits
- `issues: write` - Comment on issues
- `pull-requests: write` - Create pull requests
- `id-token: write` - Required for Claude Code action

### Allowed Tools
Claude can run these commands during implementation:
- `pnpm build` - Build the project
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm lint` - Run ESLint
- `npm run test` - Run tests

## Technical Details

### Claude Code Action
This workflow uses the official `anthropics/claude-code-action@beta` which provides:
- Direct integration with Claude's code generation capabilities
- Secure authentication via OAuth tokens
- Advanced code analysis and implementation features
- Built-in safety and quality controls

### Implementation Process
1. Claude analyzes the issue requirements
2. Reviews existing codebase patterns
3. Generates implementation following project conventions
4. Runs quality checks (build, typecheck, lint)
5. Creates commits with descriptive messages
6. Opens pull request with detailed description

## Limitations

- Only works with open issues
- Requires clear, actionable requirements
- Limited to repository collaborators
- May need manual refinement for complex features
- Cannot handle issues requiring external services or APIs without proper configuration

## Support

If you encounter issues with the automation:
1. Check workflow logs in the Actions tab
2. Verify issue requirements are clear and actionable
3. Ensure you have proper repository permissions
4. Verify `CLAUDE_CODE_OAUTH_TOKEN` secret is configured
5. Create a new issue describing the problem

---

**Note**: This automation is powered by Anthropic's Claude Code action and creates production-ready code, but all implementations should be reviewed before merging to ensure they meet your specific requirements and quality standards.