# MySQL Database Setup for New Apps

How to provision and connect to the shared MySQL instance when building a new app with a backend (React + Mobile apps).

## Prerequisites

All credentials referenced in this doc are stored in:

```
~/.claude/infrastructure.env
```

Source it or look up values there. **Never hardcode credentials in docs, scripts, or committed files.**

To load the values into your current shell:
```bash
source ~/.claude/infrastructure.env
```

## Architecture

All apps share a **single Percona MySQL 8.4 instance** running in Docker at `/srv/projects/database` on the deploy server. Each app gets its own **named database** within that instance — there is no per-app MySQL container.

| Component | Env var / Details |
|-----------|-------------------|
| **Server** | `$SERVER_HOST` (public) / `$SERVER_HOST_PRIVATE` (private) |
| **Docker container** | `$DB_CONTAINER` |
| **Port** | `$DB_PORT` (mapped `3306:3306`) |
| **App user** | `$DB_APP_USER` / `$DB_APP_PASSWORD` |
| **Root user** | `$DB_ROOT_USER` / `$DB_ROOT_PASSWORD` |
| **Memory config** | `innodb_buffer_pool_size = 512M` |

## Creating a New Database

**When:** Before first deploy of any app that has a backend (`server/` directory). The app's seed functions create tables, but they can't create the database itself.

Source the credentials and SSH to the server:

```bash
source ~/.claude/infrastructure.env

ssh ${SERVER_USER}@${SERVER_HOST}

docker exec $DB_CONTAINER mysql -u $DB_ROOT_USER -p"$DB_ROOT_PASSWORD" \
  -e "CREATE DATABASE IF NOT EXISTS my_app_name CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Replace `my_app_name` with your app's database name (use underscores, not hyphens — MySQL database names can't contain hyphens).

**Naming convention:** Use the app name with underscores. Examples: `phyx_nurse_admin`, `thc_portal`, `bb_dashboard`.

### Verifying the `app` User Has Access

The `app` user typically has broad access. To verify or grant access to the new database:

```bash
docker exec $DB_CONTAINER mysql -u $DB_ROOT_USER -p"$DB_ROOT_PASSWORD" \
  -e "GRANT ALL PRIVILEGES ON my_app_name.* TO '$DB_APP_USER'@'%'; FLUSH PRIVILEGES;"
```

### Verifying the Database Exists

```bash
docker exec $DB_CONTAINER mysql -u $DB_APP_USER -p"$DB_APP_PASSWORD" \
  -e "SHOW DATABASES LIKE 'my_app_name';"
```

## Connecting from Docker Containers (Production)

App containers reach the host MySQL via `host.docker.internal`. This requires `extra_hosts` in `docker-compose.yml`:

```yaml
api:
  environment:
    - DB_HOST=host.docker.internal
    - DB_PORT=3306
    - DB_USER=app
    - DB_PASSWORD=${DB_PASSWORD}
    - DB_NAME=${DB_NAME:-my_app_name}
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

The connection pool in `server/src/db.ts`:

```typescript
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'host.docker.internal',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'my_app_name',
  waitForConnections: true,
  connectionLimit: 5,
});

export default pool;
```

## Connecting for Local Development

There is no local MySQL client on Mac. Use an SSH tunnel to forward a local port to the server's MySQL:

```bash
source ~/.claude/infrastructure.env

# Start the tunnel (runs in background)
ssh -f -N -L 13306:localhost:${DB_PORT} ${SERVER_USER}@${SERVER_HOST}

# In your app's .env:
DB_HOST=127.0.0.1
DB_PORT=13306
DB_USER=app
DB_PASSWORD=<value from ~/.claude/infrastructure.env → DB_APP_PASSWORD>
DB_NAME=my_app_name
```

Or use a GUI tool (TablePlus, DBeaver, etc.) pointed at `127.0.0.1:13306`.

## Environment Variables

### App .env file

```env
DB_HOST=host.docker.internal   # Production (Docker)
DB_PORT=3306
DB_USER=app
DB_PASSWORD=<from ~/.claude/infrastructure.env → DB_APP_PASSWORD>
DB_NAME=my_app_name
```

### GitHub Secrets (for CI/CD deploy)

| Secret | Source |
|--------|--------|
| `DB_PASSWORD` | `~/.claude/infrastructure.env` → `DB_APP_PASSWORD` |
| `DB_NAME` | Your app's database name |

These get injected into the `.env` file by the deploy workflow's `printf` block.

## Auto-Seeding (Table Creation)

Tables are created automatically when the Express server starts. Each app's `server/src/index.ts` calls seed functions that use `CREATE TABLE IF NOT EXISTS`:

```typescript
Promise.all([
  seedFeatures(pool),    // → app_features
  seedSettings(pool),    // → app_settings
  seedCallLogs(pool),    // → call_logs
  seedTaskOutcomes(pool),// → task_outcomes_log
  seedDashboards(pool),  // → dashboards, widgets
]).then(() => {
  app.listen(PORT, '0.0.0.0', () => { /* ... */ });
}).catch((err) => {
  console.error('Failed to seed tables:', err);
  app.listen(PORT, '0.0.0.0', () => { /* ... */ }); // Start anyway
});
```

All seed functions are idempotent — safe to run multiple times.

**Critical gotcha:** The seed functions create _tables_, not the _database_. The database must already exist before the first deploy, or the seed functions will fail with `Unknown database`.

## Running SQL on Production

There is no local `mysql` CLI. Always use SSH + docker exec:

```bash
source ~/.claude/infrastructure.env

# Single query
ssh ${SERVER_USER}@${SERVER_HOST} "docker exec $DB_CONTAINER mysql -u $DB_APP_USER -p'$DB_APP_PASSWORD' my_app_name -e 'SELECT COUNT(*) FROM app_features;'"

# Multi-line / complex queries
ssh ${SERVER_USER}@${SERVER_HOST} "docker exec $DB_CONTAINER mysql -u $DB_APP_USER -p'$DB_APP_PASSWORD' my_app_name -e '
  SELECT id, key_name, enabled
  FROM app_features
  ORDER BY key_name;
'"
```

**Escaping tip for ENUM values:** Use `\\\"` inside the SSH command:
```bash
-e "ALTER TABLE my_table ADD COLUMN status ENUM(\\\"active\\\",\\\"completed\\\") DEFAULT \\\"active\\\";"
```

## New App Checklist

1. [ ] Choose a database name (underscores, no hyphens): `my_app_name`
2. [ ] Source credentials: `source ~/.claude/infrastructure.env`
3. [ ] SSH to server and create the database (see "Creating a New Database" above)
4. [ ] Grant `app` user access (see "Verifying the `app` User Has Access" above)
5. [ ] Set `DB_NAME` and `DB_PASSWORD` in GitHub Secrets (values from `infrastructure.env`)
6. [ ] Add `DB_*` vars to the deploy workflow's `printf` block
7. [ ] Confirm `docker-compose.yml` has `extra_hosts` and `DB_*` environment vars on the `api` service
8. [ ] Deploy — seed functions will create tables on first startup
9. [ ] Verify tables exist (see "Running SQL on Production" above)

## Troubleshooting

### `Unknown database 'my_app_name'`
The database hasn't been created yet. SSH to the server and run the `CREATE DATABASE` command.

### `Access denied for user 'app'@'...'`
The `app` user doesn't have access to this database. Run the `GRANT ALL PRIVILEGES` command.

### `ECONNREFUSED` or `Connection refused`
- **In Docker**: Check that `extra_hosts: ["host.docker.internal:host-gateway"]` is in `docker-compose.yml`
- **Local dev**: Check that the SSH tunnel is running (`ps aux | grep ssh.*13306`)
- **Wrong port**: Must be `3306`, not `3006` (common typo in older `.env.example` files)

### `Can't connect to MySQL server on 'localhost'`
- **In Docker**: Use `host.docker.internal`, not `localhost`. The MySQL server runs on the host, not inside the app container.

### Container name confusion
The MySQL container is `database-db-1` (NOT `database-mysql-1`). The Docker Compose service name is `db`, and the project directory is `database`.
