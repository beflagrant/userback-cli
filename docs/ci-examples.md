# CI Examples

Drop-in `userback-cli` snippets for common CI providers. Every example
assumes you've stored your Userback API token as a repository secret
named `USERBACK_API_KEY`.

- [GitHub Actions](#github-actions)
- [GitLab CI](#gitlab-ci)
- [CircleCI](#circleci)
- [Make / any shell](#make--any-shell)

---

## GitHub Actions

### File a bug when the test suite fails

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      - run: npm ci
      - run: npm test

      - name: File Userback bug on failure
        if: failure() && github.event_name == 'push' && github.ref == 'refs/heads/main'
        env:
          USERBACK_API_KEY: ${{ secrets.USERBACK_API_KEY }}
          USERBACK_DEFAULT_PROJECT_ID: ${{ vars.USERBACK_PROJECT_ID }}
          USERBACK_DEFAULT_EMAIL: ci@example.com
        run: |
          npx -y userback-cli create \
            --title "CI failed on ${GITHUB_SHA::7}" \
            --body "Run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}" \
            --type Bug \
            --priority high
```

Guarding on `github.ref == 'refs/heads/main'` avoids filing a bug for
every failing PR — usually not what you want.

### Nightly triage export

```yaml
name: Userback nightly export
on:
  schedule:
    - cron: '0 6 * * *'  # 06:00 UTC daily
  workflow_dispatch:

jobs:
  export:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: '24' }

      - name: Export recent bugs
        env:
          USERBACK_API_KEY: ${{ secrets.USERBACK_API_KEY }}
        run: |
          npx -y userback-cli list --type Bug --limit 50 --json > bugs.json

      - uses: actions/upload-artifact@v4
        with:
          name: bugs-${{ github.run_id }}
          path: bugs.json
          retention-days: 30
```

---

## GitLab CI

```yaml
file-userback-bug-on-failure:
  stage: notify
  image: node:24-alpine
  when: on_failure
  only:
    - main
  script:
    - |
      npx -y userback-cli create \
        --title "CI failed on $CI_COMMIT_SHORT_SHA" \
        --body "Pipeline: $CI_PIPELINE_URL" \
        --type Bug \
        --priority high
  variables:
    USERBACK_API_KEY: $USERBACK_API_KEY
    USERBACK_DEFAULT_PROJECT_ID: $USERBACK_PROJECT_ID
    USERBACK_DEFAULT_EMAIL: ci@example.com
```

Set `USERBACK_API_KEY` as a masked, protected CI/CD variable.

---

## CircleCI

```yaml
version: 2.1
jobs:
  notify:
    docker:
      - image: cimg/node:24.15
    steps:
      - run:
          name: File bug if job failed
          when: on_fail
          command: |
            npx -y userback-cli create \
              --title "CI failed on ${CIRCLE_SHA1:0:7}" \
              --body "Build: ${CIRCLE_BUILD_URL}" \
              --type Bug \
              --priority high
```

Add `USERBACK_API_KEY` under Project Settings → Environment Variables.

---

## Make / any shell

For scripts that run outside a CI provider (cron, systemd timer, a
CLI wrapper), the CLI works the same way:

```makefile
.PHONY: triage-export
triage-export:
	@ub list --type Bug --status "New" --limit 50 --json > triage.json
	@echo "Wrote $$(jq length triage.json) items to triage.json"

.PHONY: close-stale
close-stale:
	@ub list --status "In QA" --json \
	  | jq -r --arg cutoff "$$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
	      '.[] | select(.modified < $$cutoff) | .id' \
	  | xargs -I {} ub close {} --comment "Auto-closed after 30d in QA"
```
