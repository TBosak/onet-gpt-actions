# Cloudflare Worker secret setup

No additional Cloudflare resource is required for CareerOneStop.

Set these as per-Worker **Secret** values on `onet-gpt-api`:

```text
GPT_API_KEY
CAREERONESTOP_USER_ID
CAREERONESTOP_API_TOKEN
```

## Recommended dashboard setup

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages**.
3. Select **onet-gpt-api**.
4. Open **Settings**.
5. Under **Variables and Secrets**, choose **Add**.
6. Select **Secret** for each value.
7. Enter the exact variable name and its corresponding value.
8. Deploy the secret changes.

The secret values will be hidden after saving.

## GitHub Actions secrets

The GitHub repository should normally contain only:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Do not duplicate CareerOneStop runtime credentials into GitHub merely because
GitHub Actions deploys the Worker. Wrangler deployments preserve existing
Worker secrets.

The repository's `wrangler.jsonc` declares required secret **names**, not their
values. Deployment should fail clearly if required secrets have not been
configured.

## Local development

Copy `config/.dev.vars.example` to `.dev.vars`, enter local/test values, and keep
`.dev.vars` excluded through `.gitignore`.

## Rotation

Rotate CareerOneStop credentials directly in Cloudflare through the dashboard or
`wrangler secret put`. Do not implement automatic GitHub rotation unless there
is a later explicit operational requirement.
