# New React App Workflow

When the user wants to build a **React app**, follow this workflow:

## Step 1: Ask Setup Questions

Ask these questions (use AskUserQuestion tool):

1. **Client name** — Display name (e.g. "PHYX", "Acme Corp")
2. **Client slug** — VitalSync slug (e.g. "phyx", "acme")
3. **VitalSync API key** — API key for this tenant
4. **VitalStats dataSourceId** — Base64 dataSource ID for Ontraport REST proxy (or "skip" if not available)
5. **App name** — What to call this app (e.g. "contact-lookup", "order-dashboard")
6. **Brand colors** — Primary color, secondary color, background (or "I'll provide later")
7. **Brand fonts** — Heading font, body font (default: Montserrat headings, Inter body)
8. **Deploy target** — Server host, SSH user, port for the app (default: 10.65.65.15, admin, 3000)
9. **GitHub repo** — org/repo-name for the new private repo (e.g. "itmooti/acme-dashboard")
10. **App purpose** — Brief description of what the app should do

## Step 2: Scaffold the App

Run the scaffold script with the answers:
```bash
./scripts/new-app.sh \
  --name "Client Name" \
  --slug clientslug \
  --app-name app-name \
  --repo org/repo-name \
  --host 10.65.65.15 \
  --user admin \
  --port 3000 \
  --primary-color "#000000" \
  --secondary-color "#666666"
```

This creates a new directory at `../app-name/` (sibling to VibeCodeApps) with a complete React app.

## Step 3: Import the Data Model

Ask the user to export their VitalStats schema XML. They should place it at:
```
../app-name/schema/schema.xml
```

This is an XML file containing the full database schema. Parse it to understand all models, fields, types, relationships, and field groupings. See `docs/schema-format.md` for full parsing details.

> **MCP note:** The schema XML is used by `parse-schema.cjs` to generate TypeScript types and `schema-reference.json`. For ad-hoc field lookups during development, use the `vitalsync_describe_model` MCP tool instead — it returns live schema data including field names, types, enums, and correct query syntax.

## Step 4: Generate TypeScript Types

From the parsed XML schema, generate TypeScript interfaces in `src/types/index.ts`.

**Type mapping rules** (XML `type` attribute → TypeScript type):

| XML Type | TypeScript Type |
|---|---|
| `integer` | `number` |
| `float`, `currency`, `percent float as fraction (1 = 100%)` | `number` |
| `text`, `longtext`, `string` | `string` |
| `boolean` | `boolean` |
| `email`, `phone or sms as string`, `physical address string` | `string` |
| `url string`, `image file url` | `string` |
| `unix timestamp as integer` | `number` |
| `IANA time zone string` | `string` |
| `ISO 3166-1 alpha-2 code`, `ISO 3166-2 code...` | `string` |
| `json` | `Record<string, unknown>` |
| `geographic point` | `string` |
| `latitude as float`, `longitude as float` | `number` |
| `enum` | Union of string literals from `<enum>` children |

**Key rules:**
- Use the `publicName` attribute as the interface name (NOT the `name` attribute which has the "Thc" prefix)
- Foreign key fields (columns with `foreignKey="true"`) should be typed as `number` (they store IDs)
- Fields with `primaryKey="true"` and `type="integer"` → `number`; `type="string"` → `string`
- Fields with `required="true"` are non-optional; all others are optional (`?`)
- The `id` field is always required
- System fields (`_ts_`, `_tsCreate_`, `_tsUpdateCount_`) are optional and can be excluded from user-facing types
- Group metadata from `<groups>` can be used to organize form sections in the UI

**Example output:**
```typescript
export interface Contact {
  id: number;
  email?: string;
  first_name?: string;
  owner_id?: number; // FK → User
  status?: 'Active' | 'Inactive' | 'Archived';
  created_at?: number; // unix timestamp
}

export interface Dispense {
  id: number;
  dispense_status?: 'Cancelled' | 'Confirmed - In Progress' | 'Fulfilled' | 'In Cart';
  item_retail_price?: number; // currency
  patient_to_pay_id?: number; // FK → Contact
  pharmacy_to_dispense_id?: number; // FK → Contact
}
```

Also generate a **model metadata constant** for use with VitalSync SDK queries:
```typescript
export const MODELS = {
  Contact: {
    sdkName: 'ThcContact', // internal name — use this with plugin.switchTo()
    tableName: 'ThcContact', // internal name — for reference only
    fields: ['id', 'email', 'first_name', ...] as const,
  },
  // ... repeat for each relevant model
} as const;
```

## Step 5: Research Phase (Automated Business Intelligence)

Run the research script to collect business intelligence from the client's APIs. This generates a knowledge base that informs feature planning and UI decisions.

```bash
node ../VibeCodeApps/scripts/research.cjs \
  --slug clientslug \
  --api-key "VITALSYNC_API_KEY" \
  --datasource-id "base64_datasource_id" \
  --target ../app-name
```

**What it collects:**
- Business profile (company name, logo, website, branding) via Ontraport REST
- All objects with record counts, list fields, KPI sums, widget settings
- Field metadata with dropdown color definitions (exact Chip colors for the UI)
- Ontraport Groups/segments with filter criteria and SDK query equivalents
- Sync gap analysis (objects/fields in Ontraport but not synced to VitalStats)
- Sample records, automation logs, field value distributions via GraphQL
- Website snapshot (homepage, about, services pages)

**Output:** `research/knowledge-base.md` (committed) + `research/raw/*.json` (gitignored, contains PII)

**Use `--skip-ontraport` if no dataSourceId is available** — GraphQL-only research still produces useful results.

Read the knowledge base and present key findings to the user before proceeding to build.

> **MCP note:** After research completes, MCP tools (`vitalsync_introspect_schema`, `vitalsync_query`, `vitalsync_calc_query`, `vitalsync_ontraport_read`) are available throughout development for live API queries. The research knowledge base provides business context; MCP tools provide technical execution. See `docs/research-phase.md` for the full MCP vs. research comparison.

## Step 6: Persona & Feature Discovery

Based on research findings, ask informed questions:
- Is this app for the business or their clients?
- If business: owner, employee, or specific role?
- Which models and segments matter most for this user?
- What metrics should the dashboard show? (informed by `sums` data)
- Which status workflows are most important? (informed by enum distributions)
- Push notifications needed? (informed by automation patterns)

**Review reusable features:** Read `docs/features/` and check each available feature against this app's use case and research findings. Proactively suggest any features that would be valuable — explain what each does and why it fits. For example, if the app has a mobile component, suggest OneSignal Push Notifications; if it needs reporting, suggest Dynamic Metrics; if it needs AI assistance, suggest the AI Chat Agent.

Present the persona, recommended features (both custom and reusable), and suggested layout to the user. Get approval on the feature set before building.

## Step 7: Build the App

Based on the app purpose, data model, and research knowledge base, build the components. All implementation patterns are documented in this file and in `docs/vitalsync-sdk-patterns.md`.

Key research-informed decisions:
- Dashboard metrics from `sums` and `listFields` data
- Status chip colors from dropdown field metadata (exact hex values, not guessed)
- Filters matching Ontraport Groups (converted to SDK queries)
- List view columns matching business's `listFields` priorities

## Step 8: App Images

Generate the core image assets for the app using NanoBanana (see `docs/features/nanobana-image-generation.md`). Ask the user for their logo or generate one based on their brand.

### Required Assets

| Asset | Size | Location | Purpose |
|-------|------|----------|---------|
| `favicon-32x32.png` | 32x32 | `public/` | Browser tab icon |
| `favicon-16x16.png` | 16x16 | `public/` | Small browser tab icon |
| `apple-touch-icon.png` | 180x180 | `public/` | iOS home screen bookmark |
| `og-image.png` | 1200x630 | `public/` | Social sharing preview (optional) |

### Generation Workflow

1. **Ask the user** if they have a logo file. If yes, use it as the source.
2. **If no logo**, generate one using NanoBanana:
   ```bash
   nanobana vector --style icons --subject "logo for [app description]" --colors "[brand hex colors]" --output logo-source.png
   ```
3. **Resize the logo** into all required sizes. Use `sips` (macOS built-in) or ImageMagick:
   ```bash
   # macOS sips (no install needed):
   sips -z 180 180 logo-source.png --out public/apple-touch-icon.png
   sips -z 32 32 logo-source.png --out public/favicon-32x32.png
   sips -z 16 16 logo-source.png --out public/favicon-16x16.png

   # Or ImageMagick:
   magick logo-source.png -resize 180x180 public/apple-touch-icon.png
   magick logo-source.png -resize 32x32 public/favicon-32x32.png
   magick logo-source.png -resize 16x16 public/favicon-16x16.png
   ```
4. **Optional: Generate an OG image** for social sharing:
   ```bash
   nanobana generate --prompt "Professional banner for [app name] with [brand colors]" --aspect 2:1 --output public/og-image.png
   ```
   Then add to `index.html`:
   ```html
   <meta property="og:image" content="/og-image.png" />
   ```

## Step 9: Set Up GitHub & Deploy

1. Initialize git in the new app directory
2. Create a private GitHub repo
3. Add GitHub Actions secrets (SSH key, server details, env vars)
4. Push — triggers auto-deploy

## Step 10: Public Access via Cloudflare Tunnel (Optional)

If the client needs to access the app via a public subdomain (e.g., `dashboard.clientdomain.com`), set up a Cloudflare Tunnel route.

The server has Cloudflare Tunnel pre-provisioned. To expose an app:

1. **Ask the user** for the desired subdomain and domain (e.g., `app-name.clientdomain.com`)
2. **Add a route** in the tunnel config mapping the subdomain to `http://localhost:{port}` on the server
3. **Add a DNS record** in Cloudflare pointing the subdomain to the tunnel
4. The app is now publicly accessible with HTTPS via Cloudflare

Skip this step if the app is only used internally on the network (accessible via `http://10.65.65.15:{port}`).

---

# React App Entry Point Pattern

## main.tsx Setup

The entry point MUST set the MUI X Pro license before rendering any components:

```typescript
import { LicenseInfo } from '@mui/x-license';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// Set MUI X Pro License — MUST happen before render
const muiLicenseKey = import.meta.env.VITE_MUI_LICENSE_KEY;
if (muiLicenseKey) {
  LicenseInfo.setLicenseKey(muiLicenseKey);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={clientTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
```

## index.html Setup

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CLIENT | APP_TITLE</title>
    <!-- Google Fonts (preconnect for performance) -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@600;700;800&display=swap" rel="stylesheet" />
    <!-- VitalStats SDK (MUST load before React) -->
    <script async data-chunk="client" src="https://static-au03.vitalstats.app/static/sdk/v1/latest.js" crossorigin="anonymous"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

# React Utility Patterns

## Date Formatting (Australian locale)

```typescript
function formatDate(ts: number | string | undefined): string {
  if (!ts) return 'N/A';
  try {
    const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}
```

## Currency Formatting (AUD)

```typescript
function formatCurrency(amount: number | undefined): string {
  if (amount === null || amount === undefined) return 'N/A';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
  }).format(amount);
}
```

## Status Chip Color Mapping

Use string matching to determine Chip colors based on status values:

```typescript
function getStatusColor(status: string | undefined): { bg: string; color: string } {
  const s = (status || '').toLowerCase();
  if (s.includes('approved') || s.includes('fulfilled') || s.includes('delivered') || s.includes('closed')) {
    return { bg: brandColors.black, color: brandColors.white }; // Success
  }
  if (s.includes('pending') || s.includes('processing') || s.includes('open') || s.includes('unfulfilled')) {
    return { bg: brandColors.warningBg, color: brandColors.warning }; // In progress
  }
  if (s.includes('rejected') || s.includes('cancelled') || s.includes('hold') || s.includes('denied')) {
    return { bg: brandColors.errorBg, color: brandColors.error }; // Problem
  }
  return { bg: brandColors.lightGrey, color: brandColors.midGrey }; // Default
}
```

## External Admin URLs

Build links to external systems for quick navigation:

```typescript
// Ontraport admin link (contact)
const ontraportUrl = `https://app.ontraport.com/#!/contact/edit&id=${contact.id}`;
// Ontraport admin link (other objects — replace object slug)
const scriptUrl = `https://app.ontraport.com/#!/o_scripts10000/edit&id=${script.id}`;

// Shopify admin link (uses store-specific ID)
const shopifyUrl = `https://admin.shopify.com/store/${STORE_ID}/customers/${contact.shopifyid}`;

// Google Maps link from address fields
const addressParts = [contact.address, contact.city, contact.state, contact.zip_code].filter(Boolean);
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts.join(', '))}`;
```

## Lazy-Loading with Cache (Accordion Pattern)

Fetch related data on accordion expand, with a cache to avoid re-fetching:

```typescript
const [cache, setCache] = useState<Record<string, LineItem[]>>({});
const [loading, setLoading] = useState<Record<string, boolean>>({});

const fetchItems = async (parentId: number) => {
  if (cache[parentId]) return; // Already loaded
  setLoading(prev => ({ ...prev, [parentId]: true }));
  try {
    const records = await plugin.switchTo('PhyxLineItem').query()
      .select([...fields]).where('parent_id', '=', parentId)
      .fetchAllRecords().pipe(window.toMainInstance(true)).toPromise();
    const items = records ? Object.values(records).map(r => /* getState conversion */) : [];
    setCache(prev => ({ ...prev, [parentId]: items }));
  } finally {
    setLoading(prev => ({ ...prev, [parentId]: false }));
  }
};

// Trigger on accordion expand
<Accordion onChange={(_, expanded) => { if (expanded) fetchItems(order.id); }}>
```

## Connection Status UI Pattern

Show connection state with retry capability:

```typescript
{status === 'loading' && <CircularProgress size={20} /> + "Loading VitalSync SDK..."}
{status === 'error' && <Alert severity="error" action={<Button onClick={connect}>RETRY</Button>}>Connection failed: {error}</Alert>}
{status === 'connected' && /* main app content */}
```

## Live Indicator (Subscription Status)

Show real-time subscription status with a pulsing dot:

```typescript
<Chip
  icon={<FiberManualRecordIcon sx={{
    fontSize: 8,
    animation: isLive ? 'pulse 2s ease-in-out infinite' : 'none',
    '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
  }} />}
  label={isLive ? 'LIVE' : 'OFFLINE'}
  sx={{ bgcolor: isLive ? colors.black : colors.lightGrey }}
/>
```

---

# MUI Components to Use (React Apps Only)

- **DataGrid Pro** (`@mui/x-data-grid-pro`) — for data tables
- **Charts Pro** (`@mui/x-charts-pro`) — for bar/line/pie charts
- **Dialog** — for edit/create forms
- **Card/CardContent** — for detail sections
- **Accordion** — for expandable lists
- **Chip** — for status badges
- **TextField** — for form inputs
- **Button** — contained for primary actions, outlined for secondary

---

# MUI DataGrid Pro — Patterns & Gotchas (React Apps Only)

## Editable Columns
- Mark columns as `editable: true` in the column definition
- Use `processRowUpdate` callback to persist changes via VitalSync mutation
- Use `onProcessRowUpdateError` for error handling
- Show feedback via MUI `<Snackbar>` + `<Alert>`

## IMPORTANT: Do NOT use `valueGetter` on editable columns
`valueGetter` transforms the display value but interferes with DataGrid's edit mechanism. When a user saves an edit, DataGrid may pass the getter's transformed value instead of the raw field value, causing unexpected behavior or "rows must have unique id" errors.

**Instead:** Use `renderCell` for display-only formatting and `valueFormatter` for simple transformations. Keep editable columns with just `field`, `headerName`, and `editable: true`.

## Master-Detail Panels
- Use `getDetailPanelContent` and `getDetailPanelHeight` props on `<DataGridPro>`
- `getDetailPanelHeight` should return `'auto'` for dynamic content
- The detail panel component receives the row data and can fetch related records
- Pass `plugin` through so the detail panel can make its own VitalSync queries

## Inline Editing Mutation Pattern
```typescript
const processRowUpdate = async (newRow: Contact, oldRow: Contact) => {
  const changes: Record<string, unknown> = {};
  if (newRow.email !== oldRow.email) changes.email = newRow.email;
  // ... check other editable fields

  if (Object.keys(changes).length === 0) return oldRow;

  const mutation = plugin.switchTo('ModelName').mutation();
  mutation.update((q) => q.where('id', newRow.id).set(changes));
  await mutation.execute(true).toPromise();
  return newRow; // return newRow on success, oldRow on failure
};
```

---

## MUI Theme Setup Pattern

Create a `src/theme.ts` file with layout constants, brand colors, and component overrides:

```typescript
import { createTheme } from '@mui/material/styles';

// Layout constants — export for use in responsive calculations
export const SIDEBAR_WIDTH_EXPANDED = 360;
export const SIDEBAR_WIDTH_COLLAPSED = 56;
export const HEADER_HEIGHT = 52;
export const BOTTOM_NAV_HEIGHT = 56;

// Brand color palette — customize per client
export const appColors = {
  primary: '#000000',
  secondary: '#666666',
  background: '#fafafa',
  white: '#ffffff',
  border: '#e0e0e0',
  error: '#d32f2f',
  warning: '#ed6c02',
};

export const appTheme = createTheme({
  palette: {
    primary: { main: appColors.primary },
    secondary: { main: appColors.secondary },
    background: { default: appColors.background },
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    h1: { fontFamily: "'Montserrat', sans-serif", fontWeight: 700 },
    h2: { fontFamily: "'Montserrat', sans-serif", fontWeight: 700 },
    h3: { fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.05em' },
  },
  shape: { borderRadius: 0 }, // Sharp corners — adjust per brand
  components: {
    MuiButton: {
      styleOverrides: {
        root: { fontFamily: "'Montserrat', sans-serif", fontWeight: 600, textTransform: 'uppercase', borderRadius: 0 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 0, border: `1px solid ${appColors.border}` },
      },
    },
    // iOS Safari zoom fix: inputs < 16px trigger auto-zoom on focus
    MuiInputBase: {
      styleOverrides: {
        root: { '@media (max-width: 899px)': { fontSize: '16px !important' } },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: { '@media (max-width: 899px)': { fontSize: '16px !important' } },
      },
    },
  },
});
```

---

## MUI X Charts Pro Pattern

LineChart or BarChart with responsive sizing, auto-rotating labels, and area fill:

```typescript
import { LineChart } from '@mui/x-charts-pro';

<LineChart
  xAxis={[{
    scaleType: 'band',
    data: labels,  // e.g. ['Mon', 'Tue', 'Wed', ...]
    tickLabelStyle: {
      fontSize: 11,
      angle: labels.length > 12 ? -45 : 0,           // Auto-rotate when crowded
      textAnchor: labels.length > 12 ? 'end' : 'middle',
    },
  }]}
  series={[{
    data: values,  // e.g. [100, 150, 120, ...]
    label: 'Revenue',
    color: '#1976d2',
    area: true,     // Filled area under the line
    valueFormatter: (v) => `$${v?.toLocaleString()}`,  // Custom tooltip format
  }]}
  height={isMobile ? 280 : 360}
  margin={{ bottom: labels.length > 12 ? 60 : 40 }}
  tooltip={{ trigger: 'axis' }}
  axisHighlight={{ x: 'line' }}
  sx={{
    '.MuiAreaElement-root': { fillOpacity: 0.12 },  // Subtle area fill
  }}
/>
```

**Responsive metrics grid:**
```typescript
<Box sx={{
  display: 'grid',
  gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: isMobile ? 1.5 : 2,
}}>
  {loading ? (
    Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} variant="rectangular" height={160} />
    ))
  ) : (
    metrics.map((m) => <MetricCard key={m.id} metric={m} />)
  )}
</Box>
```

---

## Dialog Mutation Pattern

Edit a record via MUI Dialog with form fields, loading state, and error display:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

// Mutation hook with cache invalidation
function useUpdateRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number; [key: string]: unknown }) => {
      const mutation = plugin.switchTo('ModelName').mutation();
      mutation.update((q) => q.where('id', id).set(updates));
      await mutation.execute(true).toPromise();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records'] });
    },
  });
}

// Dialog component
function EditDialog({ open, onClose, record }: Props) {
  const updateRecord = useUpdateRecord();
  const [name, setName] = useState('');

  useEffect(() => {
    if (record) setName(record.name);
  }, [record]);

  const handleSave = async () => {
    if (!record) return;
    try {
      await updateRecord.mutateAsync({ id: record.id, name: name.trim() });
      onClose();
    } catch {
      // Error displayed via updateRecord.error
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Record</DialogTitle>
      <DialogContent>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
        {updateRecord.error && (
          <Alert severity="error">{(updateRecord.error as Error).message}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={updateRecord.isPending}>
          {updateRecord.isPending ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

## Responsive Sidebar Layout Pattern

Dual mobile/desktop layout with collapsible sidebar:

```typescript
const theme = useTheme();
const isMobile = useMediaQuery(theme.breakpoints.down('md'));
const { isOpen, toggle, close } = useSidebarStore();

// Auto-close sidebar on mobile after selection
const prevId = useRef(selectedId);
useEffect(() => {
  if (isMobile && selectedId && selectedId !== prevId.current) close();
  prevId.current = selectedId;
}, [selectedId, isMobile, close]);
```

**Desktop layout:** Side-by-side with smooth width transition:
```typescript
<Box sx={{ display: 'flex', height: '100vh' }}>
  {/* Sidebar */}
  <Box sx={{
    width: isOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
    minWidth: isOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
    transition: 'width 0.2s ease, min-width 0.2s ease',
    overflow: 'hidden',
    borderRight: '1px solid',
    borderColor: 'divider',
  }}>
    <SidebarContent collapsed={!isOpen} />
  </Box>

  {/* Main content */}
  <Box sx={{ flex: 1, overflow: 'auto' }}>
    <MainContent />
  </Box>
</Box>
```

**Mobile layout:** Drawer overlay + bottom navigation:
```typescript
<Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
  {/* Fixed header */}
  <AppBar position="fixed" sx={{ height: HEADER_HEIGHT }}>
    <Toolbar>
      <IconButton onClick={toggle}><MenuIcon /></IconButton>
      <Typography>App Title</Typography>
    </Toolbar>
  </AppBar>

  {/* Drawer sidebar */}
  <Drawer open={isOpen} onClose={close} sx={{ '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH_EXPANDED } }}>
    <SidebarContent />
  </Drawer>

  {/* Main content with safe area padding */}
  <Box sx={{
    flex: 1,
    mt: `${HEADER_HEIGHT}px`,
    pb: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
  }}>
    <MainContent />
  </Box>

  {/* Bottom nav */}
  <BottomNavigation sx={{
    position: 'fixed', bottom: 0, left: 0, right: 0,
    height: BOTTOM_NAV_HEIGHT,
    pb: 'env(safe-area-inset-bottom)',
  }} />
</Box>
```

---

## Zustand Store Patterns

### Simple Toggle Store
```typescript
import { create } from 'zustand';

interface SidebarStore {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: true,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
```

### Auth Store with API + localStorage
```typescript
interface AuthStore {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: localStorage.getItem('auth_token'),
  user: null,
  isAuthenticated: false,
  login: async (email, password) => {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    localStorage.setItem('auth_token', data.token);
    set({ token: data.token, user: data.user, isAuthenticated: true });
    return { success: true };
  },
  logout: () => {
    localStorage.removeItem('auth_token');
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
```

### Persist Middleware + Deduplication
```typescript
import { persist } from 'zustand/middleware';

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: [],
      addNotification: (title, body, sourceId?) =>
        set((s) => {
          if (sourceId && s.notifications.some((n) => n.sourceId === sourceId)) return s;
          return {
            notifications: [
              { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, title, body, read: false, sourceId },
              ...s.notifications,
            ].slice(0, 200),
          };
        }),
    }),
    { name: 'app-notifications' },
  ),
);

// Derived hook
export function useUnreadCount() {
  return useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);
}
```

### Cross-Store Communication
```typescript
// Store A can call Store B's actions via getState():
navigateToRecord: (id) => {
  set({ selectedId: id });
  useNavigationStore.getState().setActiveSection('records');
},
```

**Key patterns:**
- Use selector-based subscriptions: `useStore((s) => s.field)` — not `useStore()`
- Cross-store access via `.getState()` inside actions
- Immutable updates: always spread arrays/objects
- localStorage sync: read in initializer, write in actions
- Derived hooks for computed values (e.g., `useUnreadCount()`)
