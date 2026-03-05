# App Deployment Procedure — Cloudflare Tunnel + Docker + GitHub Actions

## Overview

This is the standard procedure for deploying any new web app to a public URL using the itmooti infrastructure. Learned from deploying `n8n.awesomate.ai` (Feb 2026).

## Infrastructure Summary

All credentials are stored in `~/.claude/infrastructure.env`. Source it before running any commands in this doc.

| Component | Env var / Details |
|-----------|-------------------|
| **Deploy server** | `$SERVER_HOST` (public) / `$SERVER_HOST_PRIVATE` (private) |
| **SSH access** | `$SERVER_USER` (key: `$SERVER_SSH_KEY`) |
| **Deploy path** | `/srv/projects/<app-name>/` |
| **GitHub org** | `itmooti` |
| **Cloudflare Account ID** | `$CF_ACCOUNT_ID` |
| **Cloudflare Zone (awesomate.ai)** | `$CF_ZONE_AWESOMATE` |
| **Cloudflare API Token** | `$CF_API_TOKEN` |
| **GH PAT** | Get from `gh auth token` (gho_ OAuth token, works for git clone) |

## Cloudflare API Token Permissions

The Cloudflare API token requires these permissions:
- **Account** > Cloudflare Tunnel: Edit
- **Zone** > DNS: Edit
- **Zone** > Zone: Read

The token is scoped to specific zones (domains). **When deploying to a new domain** (not `awesomate.ai`):
1. Go to Cloudflare dashboard > **My Profile** > **API Tokens**
2. Edit the token
3. Under **Zone Resources**, add the new domain
4. Save — otherwise tunnel creation or DNS record creation will return 403 Forbidden

To look up the Zone ID for another domain:
```python
import urllib.request, json, os

# Source ~/.claude/infrastructure.env first, or set these manually
token = os.environ['CF_API_TOKEN']

url = 'https://api.cloudflare.com/client/v4/zones?name=<domain.com>'
req = urllib.request.Request(url)
req.add_header('Authorization', f'Bearer {token}')
resp = urllib.request.urlopen(req)
result = json.loads(resp.read())
print(result['result'][0]['id'])  # Zone ID
```

## Critical Lesson: Use Per-App Tunnels, NOT Shared Tunnel

There is a shared Cloudflare Tunnel `vitalstats-kc1` running inside a **Kubernetes cluster**. It handles `*.awesomate.ai`, `*.vitalstats.app`, etc. via K8s services.

**DO NOT add app-specific ingress rules to this shared tunnel.** The K8s cluster cannot reach the deploy server — this results in 502 Bad Gateway errors.

**Instead, each app gets its own dedicated Cloudflare Tunnel** running as a Docker container alongside the app (pattern used by `thc-portal`, `phyx-nurse-admin`, `bb-dashboard`, `n8n-onboarding`).

## Step-by-Step Procedure

### Prerequisites
- App has: `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `.github/workflows/deploy.yml`
- Know the target subdomain (e.g., `n8n.awesomate.ai`)
- Know the port assignment (check `PORT-REGISTRY.md` or existing containers)
- Cloudflare API token has permissions for the target domain (see above)
- Source credentials: `source ~/.claude/infrastructure.env`

### Step 0: Create Database (if app has a backend)

If your app has a `server/` directory with Express + MySQL, you must create a database in the shared MySQL instance **before the first deploy**. The app's seed functions create tables automatically, but the database itself must already exist.

**Full guide:** `docs/database-setup.md`

Quick version (credentials from `~/.claude/infrastructure.env`):
```bash
source ~/.claude/infrastructure.env

ssh ${SERVER_USER}@${SERVER_HOST}
docker exec $DB_CONTAINER mysql -u $DB_ROOT_USER -p"$DB_ROOT_PASSWORD" \
  -e "CREATE DATABASE IF NOT EXISTS my_app_name CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
docker exec $DB_CONTAINER mysql -u $DB_ROOT_USER -p"$DB_ROOT_PASSWORD" \
  -e "GRANT ALL PRIVILEGES ON my_app_name.* TO '$DB_APP_USER'@'%'; FLUSH PRIVILEGES;"
```

Then add `DB_PASSWORD` and `DB_NAME` to your GitHub Secrets (Step 6).

### Step 1: Create Dedicated Cloudflare Tunnel

```python
import urllib.request, json, os

token = os.environ['CF_API_TOKEN']
account_id = os.environ['CF_ACCOUNT_ID']

url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel'

data = json.dumps({'name': '<app-name>', 'config_src': 'cloudflare'}).encode()
req = urllib.request.Request(url, data=data, method='POST')
req.add_header('Authorization', f'Bearer {token}')
req.add_header('Content-Type', 'application/json')

resp = urllib.request.urlopen(req)
result = json.loads(resp.read())
tunnel = result['result']
# SAVE: tunnel['id'] and tunnel['token']
```

### Step 2: Configure Tunnel Ingress

The service should be `http://app:80` — this is the Docker Compose service name, reachable within the Docker network.

```python
tunnel_id = '<tunnel-id-from-step-1>'
url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations'

config = {
  'config': {
    'ingress': [
      {'service': 'http://app:80', 'hostname': '<subdomain>.awesomate.ai', 'originRequest': {}},
      {'service': 'http_status:404', 'originRequest': {}}
    ]
  }
}

data = json.dumps(config).encode()
req = urllib.request.Request(url, data=data, method='PUT')
req.add_header('Authorization', f'Bearer {token}')
req.add_header('Content-Type', 'application/json')
resp = urllib.request.urlopen(req)
```

### Step 3: Create DNS CNAME Record

```python
zone_id = os.environ['CF_ZONE_AWESOMATE']  # Or look up another domain's zone ID
url = f'https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records'

data = json.dumps({
    'type': 'CNAME',
    'name': '<subdomain>',  # just the subdomain part, e.g. 'n8n'
    'content': f'{tunnel_id}.cfargotunnel.com',
    'proxied': True,
    'ttl': 1
}).encode()

req = urllib.request.Request(url, data=data, method='POST')
req.add_header('Authorization', f'Bearer {token}')
req.add_header('Content-Type', 'application/json')
resp = urllib.request.urlopen(req)
```

**Note:** The wildcard `*.awesomate.ai` CNAME already exists pointing to the shared K8s tunnel. The specific CNAME record takes priority over the wildcard for proxied records.

### Step 4: Add Tunnel to docker-compose.yml

```yaml
  tunnel:
    image: cloudflare/cloudflared:latest
    command: tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    depends_on:
      - app
```

### Step 5: Update deploy.yml .env Section

Add `CLOUDFLARE_TUNNEL_TOKEN` to the printf block:

```yaml
            printf '%s\n' \
              "VITE_VITALSYNC_API_KEY=${{ secrets.VITE_VITALSYNC_API_KEY }}" \
              "VITE_VITALSYNC_SLUG=${{ secrets.VITE_VITALSYNC_SLUG }}" \
              "CLOUDFLARE_TUNNEL_TOKEN=${{ secrets.CLOUDFLARE_TUNNEL_TOKEN }}" \
              > .env
```

Also ensure `workflow_dispatch:` is in the `on:` triggers for manual deploys:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

### Step 6: Set GitHub Repository Secrets

Use `gh secret set` for each. Values come from `~/.claude/infrastructure.env`:

| Secret | Env var / Source |
|--------|-----------------|
| `SERVER_HOST` | `$SERVER_HOST` |
| `SERVER_USER` | `$SERVER_USER` |
| `SSH_PRIVATE_KEY` | `gh secret set SSH_PRIVATE_KEY < ~/.ssh/id_ed25519` |
| `GH_PAT` | Output of `gh auth token` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token from Step 1 |
| `VITE_VITALSYNC_API_KEY` | App-specific VitalStats API key |
| `VITE_VITALSYNC_SLUG` | App-specific VitalStats account slug |

Add any other app-specific secrets as needed (JWT_SECRET, DB_PASSWORD, etc.).

### Step 7: Push and Deploy

```bash
git push origin main
# Or trigger manually:
gh workflow run deploy.yml --repo itmooti/<app-name> --ref main
```

### Step 8: Verify

```bash
source ~/.claude/infrastructure.env
1. Check GitHub Actions: `gh run list --repo itmooti/<app-name> --limit 1`
2. Check containers: `ssh ${SERVER_USER}@${SERVER_HOST} "docker ps --filter name=<app-name>"`
3. Test URL: `curl -s -o /dev/null -w '%{http_code}' https://<subdomain>.awesomate.ai`
```

## Troubleshooting

### 502 Bad Gateway
- Tunnel can't reach the app. Check that tunnel ingress points to `http://app:80` (Docker service name), NOT an IP address.
- Check tunnel container is running: `docker ps --filter name=<app>-tunnel`
- Check tunnel logs: `docker logs <app>-tunnel-1`
- If you accidentally added ingress to the shared K8s tunnel, remove it and create a per-app tunnel instead.

### 403 Forbidden on Cloudflare API
- The API token doesn't have permission for the target domain. Edit the token in Cloudflare dashboard and add the zone (see "Cloudflare API Token Permissions" above).

### SSH Timeout in GitHub Actions
- `SERVER_HOST` must be the **public IP**, NOT the private IP. GitHub Actions runners are on the public internet and cannot reach private IPs.

### Shell Escaping in Cloudflare API Calls
- Use Python `urllib.request` instead of `curl` for Cloudflare API calls. Complex JSON with special characters (like `__configuration_flags`) causes shell escaping issues with curl.
- Alternative: write JSON to a temp file and use `curl -d @/tmp/file.json`

### Existing Apps on Server
Check what's running:
```bash
source ~/.claude/infrastructure.env
ssh ${SERVER_USER}@${SERVER_HOST} "docker ps --format 'table {{.Names}}\t{{.Ports}}'"
```

Known apps (as of Feb 2026):
- `phyx-contact-lookup` — port 3000
- `phyx-nurse-admin` — port 3010 (+ tunnel)
- `thc-portal` — port 3020 (+ tunnel)
- `bb-dashboard` — port 3030
- `n8n-onboarding` — port 3050 (+ tunnel)
- `database` — MySQL port 3306

## Files That Every Deployed App Needs

1. **Dockerfile** — Multi-stage: `node:20-alpine` build -> `nginx:alpine` serve
2. **docker-compose.yml** — App service + tunnel service + any APIs/DBs
3. **nginx.conf** — SPA fallback (`try_files $uri $uri/ /index.html`), static caching, gzip
4. **.github/workflows/deploy.yml** — SSH deploy via `appleboy/ssh-action@v1` with `workflow_dispatch`
5. **.env.example** — Document required env vars
