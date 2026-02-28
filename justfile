# default recipe — show available commands
default:
    @just --list

# Install dependencies
install:
    bun install

# Run local dev server
dev:
    bun run dev

# Deploy to Cloudflare
deploy: check
    bun run deploy

# Run all checks (typecheck + lint + test)
check: typecheck lint test

# Type-check
typecheck:
    bun run typecheck

# Lint
lint:
    bun run lint

# Lint with auto-fix
fix:
    bun run lint:fix

# Format with prettier
format:
    bun run format

# Run tests
test:
    bun run test

# tail logs
tail:
    bun run wrangler tail

# Set a wrangler secret (interactive)
secret name:
    bun run wrangler secret put {{name}}

# Set all secrets (interactive, one by one)
secrets:
    @for s in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET CF_ACCOUNT_ID CF_API_TOKEN ANTHROPIC_API_KEY; do \
        echo "--- Setting $$s ---"; \
        wrangler secret put "$$s"; \
    done
