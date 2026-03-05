# Deployment Architecture

## React Apps

```
Push to main → GitHub Actions → SSH to server → git pull → docker compose up -d --build
```

- Dockerfile: multi-stage (Node 20 alpine build → nginx alpine serve)
- Vite env vars are baked into JS bundle at build time via Docker build args
- Server path: /srv/projects/{app-name}
- MySQL available via percona/percona-server:8.4 if needed

### GitHub Actions CI/CD Details (React Apps)

**Required GitHub Secrets:**

| Secret | Purpose |
|---|---|
| `SERVER_HOST` | Server IP (public IP if deploying from GitHub Actions) |
| `SERVER_USER` | SSH user on the server (e.g., `admin`) |
| `SSH_PRIVATE_KEY` | Ed25519 private key for SSH access |
| `GH_PAT` | GitHub Personal Access Token (classic, `repo` scope) for cloning private repos |
| `VITE_VITALSYNC_API_KEY` | VitalSync API key (baked into build) |
| `VITE_VITALSYNC_SLUG` | VitalSync tenant slug (baked into build) |
| `VITE_MUI_LICENSE_KEY` | MUI X Pro license key (baked into build) |

**Key gotchas:**
- GitHub Actions runners cannot reach private IPs (e.g., 10.x.x.x). Use the server's **public IP** for `SERVER_HOST`
- Use HTTPS + PAT for `git clone` on the server (not SSH), since the server may not have GitHub SSH keys:
  `git clone https://${{ secrets.GH_PAT }}@github.com/org/repo.git`
- Set `SSH_PRIVATE_KEY` by piping the key file: `gh secret set SSH_PRIVATE_KEY < ~/.ssh/id_ed25519`
  (do NOT use `--body` flag — it mangles multi-line keys)
- **Use `printf` not `cat` heredoc** for writing `.env` files in deploy scripts — `cat` heredoc with indentation injects leading spaces into env var values:
  ```bash
  # CORRECT: printf avoids indentation issues
  printf '%s\n' \
    "VITE_MUI_LICENSE_KEY=${{ secrets.VITE_MUI_LICENSE_KEY }}" \
    "VITE_VITALSYNC_API_KEY=${{ secrets.VITE_VITALSYNC_API_KEY }}" \
    "VITE_VITALSYNC_SLUG=${{ secrets.VITE_VITALSYNC_SLUG }}" \
    > .env
  ```

---

## React + Mobile Apps (Multi-Service)

For apps with a backend API and mobile support, use Docker Compose with three services:

```
Push to main → GitHub Actions → SSH to server → docker compose up -d --build
                                                 ├── app (port 3010 → nginx → React SPA)
                                                 ├── api (port 4000 → Express)
                                                 └── tunnel (Cloudflare → HTTPS)
```

### docker-compose.yml

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_MUI_LICENSE_KEY: ${VITE_MUI_LICENSE_KEY}
        VITE_VITALSYNC_API_KEY: ${VITE_VITALSYNC_API_KEY}
        VITE_VITALSYNC_SLUG: ${VITE_VITALSYNC_SLUG}
    ports:
      - "3010:80"
    restart: unless-stopped
    depends_on:
      - api

  api:
    build:
      context: ./server
      dockerfile: Dockerfile
    environment:
      - DB_HOST=host.docker.internal
      - DB_PORT=3306
      - DB_USER=app
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME:-app_database}
      - JWT_SECRET=${JWT_SECRET}
      - PORT=4000
      - VITALSYNC_SLUG=${VITE_VITALSYNC_SLUG}
      - VITALSYNC_API_KEY=${VITE_VITALSYNC_API_KEY}
      - ONTRAPORT_DATASOURCE_ID=${ONTRAPORT_DATASOURCE_ID}
      - ONTRAPORT_API_APPID=${ONTRAPORT_API_APPID}
      - ONTRAPORT_API_KEY=${ONTRAPORT_API_KEY}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped

  tunnel:
    image: cloudflare/cloudflared:latest
    command: tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    depends_on:
      - app
```

**Key points:**
- `extra_hosts: ["host.docker.internal:host-gateway"]` — required for the API container to reach the MySQL database running on the host
- The `app` service uses the nginx.conf that proxies `/api/*` to `http://api:4000` within the Docker network
- The `tunnel` service provides HTTPS access via Cloudflare Zero Trust — configure the tunnel route in the Cloudflare dashboard
- Mobile apps set `server.url` in `capacitor.config.ts` to the Cloudflare Tunnel domain (e.g., `https://app.client.com`)

### Additional GitHub Secrets for Multi-Service Apps

> **Important:** The database must be created on the shared MySQL instance before first deploy. See `docs/database-setup.md` for the full provisioning procedure.

| Secret | Purpose |
|---|---|
| `DB_PASSWORD` | MySQL database password |
| `DB_NAME` | Database name |
| `JWT_SECRET` | JWT signing secret (32+ characters) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token |
| `ONTRAPORT_API_APPID` | Ontraport API App ID (if using Ontraport proxy) |
| `ONTRAPORT_API_KEY` | Ontraport API Key (if using Ontraport proxy) |
| `ONTRAPORT_DATASOURCE_ID` | VitalStats dataSource ID (if using Ontraport proxy) |

---

## Ontraport Apps

```
Push to main → GitHub Actions → Upload src/ → GitHub Pages
```

- No build step — JS/CSS files are served raw from GitHub Pages
- Only the `src/` directory is deployed (not `dev/`, `html/`, `schema/`, `node_modules/`)
- URL pattern: `https://{org}.github.io/{repo-name}/js/app.js`
- GitHub Pages has CDN caching — append `?v=N` to script URLs for cache busting (see below)
- HTML fragments in `html/` are pasted manually into Ontraport page settings

### Cache Busting for Ontraport Deployments

GitHub Pages and browsers aggressively cache static files. After pushing code changes, the Ontraport page may still serve the old JS. **Always use `?v=N` version params** on script URLs in the Ontraport footer code:

```html
<script src="https://org.github.io/repo/js/app.js?v=3"></script>
```

**Workflow after each deploy:**
1. Push changes to `main` → GitHub Actions deploys to GitHub Pages
2. Increment the `?v=N` parameter on the changed script URL(s) in the Ontraport footer code
3. Hard refresh the Ontraport page (Cmd+Shift+R) to verify

**Tips:**
- Only need to bump the version on files that actually changed (usually just `app.js`)
- Keep the `?v=N` values in sync across all scripts in `html/footer.html` for consistency
- If unsure whether a deploy is live, open the JS file URL directly in the browser and search for your latest change

---

## Server Details (React Apps)

- **Public IP**: `15.204.34.114` (OVH) — use for GitHub Actions SSH deploy (`SERVER_HOST` secret)
- **Private IP**: `10.65.65.15` — local network access only
- **SSH user**: `admin` (key: `~/.ssh/id_ed25519`)
- **Projects dir**: `/srv/projects/` (exists, subdirectories created per app on first deploy)
- **Node.js**: Installed via `nvm` — multiple versions available
- **Docker**: Installed, `admin` user is in docker group (no `sudo` needed)

### Deployed Apps (Feb 2026)

| App | Deploy Port | API Port | Tunnel | Repo |
|-----|-------------|----------|--------|------|
| phyx-contact-lookup | 3000 | — | No | itmooti/phyx-contact-lookup |
| phyx-nurse-admin | 3010 | 4000 | Yes | itmooti/phyx-nurse-dashboard |
| thc-portal | 3020 | 4020 | Yes | itmooti/thc-portal |
| bb-dashboard | 3030 | 4030 | No | itmooti/bb-dashboard |
| n8n-onboarding | 3050 | — | Yes | itmooti/n8n-onboarding |
| database | 3306 | — | — | — |

---

## Cloudflare Tunnel Setup

**For the full step-by-step procedure with API calls, see `docs/deployment-procedure.md`.**

### Critical: Use Per-App Tunnels, NOT the Shared Tunnel

There is a shared Cloudflare Tunnel `vitalstats-kc1` running inside a **Kubernetes cluster**. It handles `*.awesomate.ai`, `*.vitalstats.app`, etc. via K8s services.

**DO NOT add app-specific ingress rules to this shared tunnel.** The K8s cluster cannot reach the deploy server — this results in 502 Bad Gateway errors.

**Each app gets its own dedicated Cloudflare Tunnel** running as a Docker container alongside the app.

### Cloudflare API Details

All Cloudflare credentials are in `~/.claude/infrastructure.env`:

| Item | Env var |
|------|---------|
| Account ID | `$CF_ACCOUNT_ID` |
| API Token | `$CF_API_TOKEN` |
| Zone (awesomate.ai) | `$CF_ZONE_AWESOMATE` |

**API Token Permissions**: The token must have **Zone:DNS (Edit)** and **Account:Cloudflare Tunnel (Edit)** permissions. When deploying to a **new domain** (not `awesomate.ai`), you must add that domain/zone to the token's permission scope in the Cloudflare dashboard (API Tokens → Edit → Zone Resources).

### Quick Summary

1. **Create a dedicated tunnel** via Cloudflare API (Python — see `docs/deployment-procedure.md`)
2. **Configure ingress** — service: `http://app:80` (Docker Compose service name)
3. **Create DNS CNAME** — `<subdomain>` → `<tunnel-id>.cfargotunnel.com`, proxied
4. **Add tunnel service** to `docker-compose.yml`:
   ```yaml
     tunnel:
       image: cloudflare/cloudflared:latest
       command: tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}
       restart: unless-stopped
       depends_on:
         - app
   ```
5. **Set `CLOUDFLARE_TUNNEL_TOKEN`** as a GitHub Actions secret

### Key Points
- The tunnel container connects outbound to Cloudflare — no inbound ports needed on the server
- HTTPS is terminated at Cloudflare — the tunnel carries HTTP internally
- Mobile apps set `server.url` in `capacitor.config.ts` to the tunnel domain
- Specific CNAME records take priority over wildcard records for proxied DNS
- Use Python `urllib.request` instead of `curl` for Cloudflare API calls (avoids shell escaping issues)
