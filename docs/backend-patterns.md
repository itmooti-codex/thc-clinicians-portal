# Backend Patterns (Express + MySQL)

For React + Mobile apps that need a backend API (auth, Ontraport proxy, etc.).

## Server Structure

```
server/
├── src/
│   ├── index.ts           # Express app (CORS, routes, 0.0.0.0 binding)
│   ├── db.ts              # MySQL connection pool
│   └── routes/
│       ├── auth.ts        # JWT login/verify endpoints
│       └── conversations.ts  # Ontraport REST API proxy (optional)
├── Dockerfile             # Node 20 alpine
├── package.json           # express, mysql2, bcryptjs, jsonwebtoken, dotenv, cors
└── tsconfig.json
```

## Server Entry Point

**CRITICAL:** `import 'dotenv/config'` MUST be the first import. Server MUST bind to `0.0.0.0` (not `127.0.0.1`) for Docker and mobile access.

```typescript
import 'dotenv/config'; // MUST be first import!
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors({
  origin: [
    'http://localhost',
    'http://localhost:3000',      // Web app
    'http://localhost:5173',      // Mobile browser dev
    'http://192.168.1.170:5173',  // iPhone WiFi testing (Mac's IP)
    'http://192.168.1.170:5174',  // iPhone WiFi testing (alt port)
    'capacitor://localhost',      // Native mobile WebView
  ],
  credentials: true,
}));

app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', authRoutes);

app.listen(PORT, '0.0.0.0', () => {  // CRITICAL: 0.0.0.0 for network access
  console.log(`API server running on port ${PORT}`);
});
```

## MySQL Connection Pool

```typescript
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
```

> **Database provisioning:** This assumes the database already exists on the shared MySQL instance. See `docs/database-setup.md` for how to create a new database, set up access, and configure environment variables before first deploy.

## JWT Auth Pattern

**Database table:** `admin_users` with `id`, `email`, `password_hash` (bcrypt), `name`, `last_login_at`

```typescript
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

// POST /api/login
const [rows] = await pool.execute('SELECT id, email, password_hash, name FROM admin_users WHERE email = ?', [email]);
const valid = await bcrypt.compare(password, user.password_hash);
const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// GET /api/verify (with Authorization: Bearer <token>)
const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
```

## Frontend Auth Store (Zustand)

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
// Web: '' (empty) → '/api/login' via Vite proxy
// Mobile: 'http://10.65.65.15:3010' → 'http://10.65.65.15:3010/api/login'

const response = await fetch(`${API_BASE}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
```

## Vite Proxy (Local Dev)

In `vite.config.ts`, proxy `/api/*` requests to the backend:
```typescript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:4000',
      changeOrigin: true,
    },
  },
},
```

## nginx Proxy (Production)

In `nginx.conf`, proxy `/api/` to the `api` Docker service:
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://api:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
}
```

## Ontraport REST API Proxy (Optional)

When the app needs to read/write Ontraport data not available through VitalSync:

**VitalStats Ontraport REST API (reads):**
- Endpoint: `https://{slug}.vitalstats.app/api/v1/rest/ontraport/{Object}/{method}`
- Required headers: `Api-Key`, `Content-Type: application/json`, **`dataSourceId`**
- **`dataSourceId` is critical** — without it you get 403
- PHYX dataSourceId: `dml0YWxzdGF0c3x8RGF0YVNvdXJjZXx8Nw==` (base64 of `vitalstats||DataSource||7`)

**Direct Ontraport API (writes):**
- Endpoint: `https://api.ontraport.com/1/{Object}`
- Headers: `Api-Appid`, `Api-Key`

## Magic Link Auth Pattern

For apps that authenticate users via email magic links (no password required).

### Flow
1. User enters email → POST `/api/auth/magic-link`
2. Server looks up contact in VitalSync via `calcContacts` GraphQL query
3. Server generates one-time token, stores in-memory with 15-min expiry
4. Server sends magic link URL to n8n webhook → n8n sends email
5. User clicks link → app navigates to `/verify?token=...`
6. Frontend POSTs token to `/api/auth/verify`
7. Server validates token, issues JWT session (30-day expiry)
8. Frontend stores JWT in localStorage, includes in future API calls

### Key Implementation Notes
- **Don't reveal email existence** — always return `{ success: true }` even if email not found
- **In-memory token store** — adequate for single-server deploys; use Redis for multi-instance
- **VitalSync contact lookup** uses `calcContacts` GraphQL query (direct API, not SDK)
- **n8n webhook** sends the actual email — keeps email templates/logic in n8n, not app code
- **Security**: tokens are one-time use (deleted after verification), cryptographically random (32 bytes)
