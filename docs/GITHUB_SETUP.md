# GitHub repository setup

This repository is `TBosak/onet-gpt-actions` and uses `main` as its default branch.

## GitHub authentication

Authenticate GitHub CLI before pushing or managing Actions configuration:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status
```

## Production environment and GitHub secrets

Both deployment workflows use the protected GitHub environment named `production`. Create or confirm that environment, then add exactly these two environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

From the repository directory:

```bash
gh api --method PUT repos/TBosak/onet-gpt-actions/environments/production

gh secret set CLOUDFLARE_ACCOUNT_ID \
  --env production \
  --repo TBosak/onet-gpt-actions

gh secret set CLOUDFLARE_API_TOKEN \
  --env production \
  --repo TBosak/onet-gpt-actions

gh secret list \
  --env production \
  --repo TBosak/onet-gpt-actions
```

Each `gh secret set` command prompts for the value without placing it in the command line. The API token should be account-scoped and limited to Workers Scripts: Edit, D1: Edit, and Account Settings: Read. Do not use the Global API Key.

After both secrets are listed, trigger deployment:

```bash
gh workflow run deploy.yml --repo TBosak/onet-gpt-actions
```

Do not add these Worker runtime secrets to GitHub Actions:

- `GPT_API_KEY`
- `CAREERONESTOP_USER_ID`
- `CAREERONESTOP_API_TOKEN`

Set those directly on the existing Worker through Cloudflare Dashboard or Wrangler. `wrangler.jsonc` declares their names and deployment validates that they exist, but the repository contains no values. Normal deployment preserves encrypted Worker secrets.

## Workflow behavior

- **Validate and Deploy Worker** installs the pinned dependencies, runs the complete CI suite, verifies the two Cloudflare deployment credentials, and invokes the repository's pinned Wrangler CLI directly.
- **Refresh O*NET Data** performs the same credential preflight before detecting, transforming, validating, importing, and activating a changed downloadable O*NET release.
- Neither workflow calls CareerOneStop, consumes CareerOneStop credentials, provisions runtime secrets, or calls O*NET Web Services.
- Documentation-only and removed diagnostic-file changes do not trigger Worker deployment.

## Recommended branch rules

Protect `main`, require pull requests, require successful CI checks, dismiss stale approvals, block force pushes, and restrict production-environment approval. Workflow permissions remain `contents: read`.
