# GitHub repository setup

The repository should be named `onet-gpt-api` and use `main` as its default branch.

## Create and push

From the directory containing this scaffold:

```bash
git init
git add .
git commit -m "Build O*NET, Interest Profiler, and EDGE Worker API"
git branch -M main
gh repo create onet-gpt-api --private --source=. --remote=origin --push
```

Choose public visibility only after reviewing licensing, privacy, and operational documentation.

## GitHub secrets and environment

Create a protected GitHub environment named `production`, then add exactly:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Do not add these Worker runtime secrets to ordinary GitHub Actions configuration:

- `GPT_API_KEY`
- `CAREERONESTOP_USER_ID`
- `CAREERONESTOP_API_TOKEN`

Set those directly on the existing Worker through Cloudflare Dashboard or Wrangler. `wrangler.jsonc` declares their names and deployment validates that they exist, but the repository contains no values. Normal deployment preserves encrypted Worker secrets.

## Workflow behavior

- **Validate and Deploy Worker** runs the complete CI suite before deploying source to the fixed Worker.
- **Refresh O*NET Data** runs the same suite before detecting, transforming, validating, importing, and activating a changed downloadable O*NET release.
- Neither workflow calls CareerOneStop, consumes CareerOneStop credentials, provisions runtime secrets, or calls O*NET Web Services.

## Recommended branch rules

Protect `main`, require pull requests, require successful CI checks, dismiss stale approvals, block force pushes, and restrict production-environment approval. Workflow permissions remain `contents: read`.
