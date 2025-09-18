# Claude PR Assistant

This workflow allows Claude to assist with Pull Requests by implementing improvements, fixes, and changes directly on the PR branch when mentioned in comments.

## How to Use

### 1. Comment on Any PR

Use one of these trigger commands in a comment on any open pull request:

- `@claude implement` - Implement new features or functionality
- `@claude fix` - Fix bugs or issues in the PR
- `@claude improve` - Improve existing code quality
- `@claude update` - Update code to match requirements
- `@claude refactor` - Refactor code for better structure
- `@claude help` - General assistance with the PR

### 2. Example Usage

```
@claude fix

Please fix the TypeScript errors in the payments collection and ensure proper typing for the provider data field.
```

```
@claude improve

Can you optimize the invoice generation logic and add better error handling?
```

```
@claude implement

Add validation for email addresses in the customer billing information fields. Make sure it follows the existing validation patterns.
```

## What Happens

1. **Permission Check**: Verifies you are `bvdaakster` (only authorized user)
2. **PR Analysis**: Claude analyzes the current PR context and changes
3. **Implementation**: Makes the requested changes directly on the PR branch
4. **Quality Checks**: Runs build, typecheck, and lint
5. **Commit & Push**: Commits changes with descriptive messages
6. **Notification**: Updates the PR with completion status

## Features

### ✅ Direct PR Modification
- Works directly on the existing PR branch
- No new branches or PRs created
- Changes appear immediately in the PR

### ✅ Smart Context Awareness
- Understands the current PR changes
- Analyzes existing code patterns
- Maintains consistency with the codebase

### ✅ Comprehensive Request Handling
- Code improvements and refactoring
- Bug fixes within the PR
- Adding missing features
- Documentation updates
- Type error fixes
- Performance optimizations
- Test additions

### ✅ Quality Assurance
- Follows TypeScript conventions
- Uses ESM module structure
- Runs automated quality checks
- Maintains coding standards

## Command Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `@claude implement` | Add new functionality | "implement user authentication" |
| `@claude fix` | Fix bugs or errors | "fix the validation logic" |
| `@claude improve` | Enhance existing code | "improve performance of query" |
| `@claude update` | Update to requirements | "update to use new API format" |
| `@claude refactor` | Restructure code | "refactor into smaller functions" |
| `@claude help` | General assistance | "help with error handling" |

## Examples

### Bug Fix Request
```
@claude fix

There's a TypeScript error in `src/providers/stripe.ts` on line 45. The `amount` property is missing from the payment object. Please fix this and ensure proper typing.
```

### Feature Implementation
```
@claude implement

Add support for recurring payments in the Stripe provider. Follow the same pattern as the Mollie provider and include proper webhook handling.
```

### Code Improvement
```
@claude improve

The `validatePayment` function in utils.ts is getting complex. Please refactor it to be more readable and add proper error messages for each validation case.
```

### Documentation Update
```
@claude update

Update the JSDoc comments in the billing plugin configuration to include examples of how to use the new customer info extractor feature.
```

## Response Types

### Success Response
```
✅ PR Assistance Complete!

🔧 Changes Made:
- ✅ Analyzed PR context and requirements
- ✅ Implemented requested improvements/fixes
- ✅ Followed project coding standards
- ✅ Updated the current PR branch

Changes are ready for review! 🚀
```

### No Changes Response
```
ℹ️ PR Assistance Complete - No Changes

Analysis Result: The requested feature is already implemented

💡 Suggestions:
- Provide more detailed requirements
- Point to specific files or functions
```

### Error Response
```
❌ PR Assistance Failed

🔄 Try Again:
- Providing more specific instructions
- Breaking down complex requests
```

## Best Practices

### Clear Instructions
- Be specific about what you want changed
- Reference specific files or functions when possible
- Provide context about the desired outcome

### Examples of Good Requests
```
@claude fix the TypeScript error in src/collections/payments.ts line 42 where the status field is missing from the Payment interface

@claude implement email validation in the customer billing form using the same pattern as the phone validation

@claude refactor the webhook handler in providers/mollie.ts to extract the payment processing logic into separate functions
```

### Examples of Unclear Requests
```
@claude fix everything
@claude make it better
@claude help with this
```

## Limitations

- **User Restriction**: Only `bvdaakster` can use this feature
- **PR Only**: Works on pull request comments, not issue comments
- **Open PRs**: Only works on open pull requests
- **Branch Access**: Requires write access to the PR branch

## Technical Details

### Workflow Triggers
- Event: `issue_comment` on pull requests
- Conditions: Comment contains Claude trigger words
- Permissions: User must be `bvdaakster`

### Quality Checks
Claude automatically runs:
- `pnpm build` - Verify code compiles
- `pnpm typecheck` - Check TypeScript types
- `pnpm lint` - Ensure code style compliance
- `npm run test` - Run test suite (if available)

### Commit Messages
Automatic commits include:
- Description of the request
- PR number and requester
- Claude attribution
- Proper co-authoring

### Branch Strategy
- Works directly on the PR's head branch
- No additional branches created
- Changes pushed to existing PR
- Maintains PR history

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Only `bvdaakster` can use Claude PR assistance
   - Verify you're commenting as the correct user

2. **No Changes Made**
   - Request might be unclear or already implemented
   - Try providing more specific instructions
   - Reference specific files or lines

3. **Workflow Failed**
   - Check the Actions tab for detailed logs
   - Verify the PR branch is accessible
   - Ensure request is actionable

### Getting Help

If Claude assistance isn't working:
1. Check the workflow logs in Actions tab
2. Verify your request is specific and actionable
3. Try breaking complex requests into smaller parts
4. Use different command triggers (@claude fix vs @claude implement)

---

**Note**: This feature uses the official Anthropic Claude Code action for reliable, production-ready assistance. All changes should be reviewed before merging.