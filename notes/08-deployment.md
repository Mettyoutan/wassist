# WAssist — Deployment ke GCP Cloud Run
> Wajib deploy ke sini — bobot juri 25% untuk Teknologi & AI / Google Cloud.

---

## Kenapa Cloud Run?

- GCW 2.0 secara eksplisit mendorong penggunaan Google Cloud
- Cloud Run = container-based, auto-scale, pay-per-request
- Tidak perlu manage server
- Free tier: 2 juta request/bulan, 360.000 vCPU-seconds/bulan

---

## Persiapan

### Prerequisites
- Akun Google (gmail) → aktifkan Google Cloud Console
- Install Google Cloud CLI: https://cloud.google.com/sdk/docs/install
- Install Docker Desktop: https://www.docker.com/products/docker-desktop/

### Setup Project GCP
```bash
# Login ke Google Cloud
gcloud auth login

# Buat project baru (atau pakai yang sudah ada)
gcloud projects create wassist-demo-2026
gcloud config set project wassist-demo-2026

# Aktifkan billing (diperlukan untuk Cloud Run)
# Buka: console.cloud.google.com → Billing → Link billing account

# Enable APIs yang dibutuhkan
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

---

## Dockerfile

Buat file `Dockerfile` di root project:

```dockerfile
# Dockerfile

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 2: Build Next.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Env vars build-time (yang dibutuhkan saat build)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Salin build artifacts
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### Update next.config.js untuk standalone output:

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",  // ← wajib untuk Docker
};

module.exports = nextConfig;
```

### .dockerignore

```
node_modules
.next
.env.local
.git
```

---

## Build & Deploy ke Cloud Run

### Option A: Deploy via gcloud CLI (Recommended)

```bash
# 1. Build image dan push ke Google Artifact Registry
gcloud builds submit \
  --tag gcr.io/wassist-demo-2026/wassist \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJxxx..." \
  --build-arg NEXT_PUBLIC_APP_URL="https://wassist-xxx-as.a.run.app"

# 2. Deploy ke Cloud Run
gcloud run deploy wassist \
  --image gcr.io/wassist-demo-2026/wassist \
  --platform managed \
  --region asia-southeast1 \         # Singapore — paling dekat Indonesia
  --allow-unauthenticated \           # bisa diakses publik
  --min-instances=1 \                 # jangan cold start saat demo
  --max-instances=1 \                 # single instance untuk in-memory session
  --memory=512Mi \
  --cpu=1 \
  --port=3000
```

### Option B: Deploy via Google Cloud Console UI

1. Buka https://console.cloud.google.com → Cloud Run
2. Klik **Create Service**
3. Pilih "Continuously deploy from a repository" (atau upload container)
4. Isi konfigurasi, region: asia-southeast1
5. Set minimum instances: 1

---

## Environment Variables di Cloud Run

Setelah deploy, set env vars lewat Cloud Run UI atau CLI:

```bash
gcloud run services update wassist \
  --region asia-southeast1 \
  --set-env-vars \
    META_PHONE_NUMBER_ID="123456789",\
    META_ACCESS_TOKEN="EAAxxxx",\
    META_VERIFY_TOKEN="wassist_verify_2026",\
    META_APP_SECRET="xxxxxx",\
    GEMINI_API_KEY="AIzaSyxxxx",\
    NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co",\
    NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJxxx",\
    SUPABASE_SERVICE_ROLE_KEY="eyJxxx",\
    MIDTRANS_SERVER_KEY="SB-Mid-server-xxx",\
    MIDTRANS_CLIENT_KEY="SB-Mid-client-xxx",\
    MIDTRANS_IS_PRODUCTION="false",\
    JWT_SECRET="minimal_32_karakter_random_string",\
    NEXT_PUBLIC_APP_URL="https://wassist-xxx-as.a.run.app"
```

Lebih aman: gunakan **Secret Manager** GCP untuk credentials sensitive:
```bash
# Buat secret
echo -n "EAAxxxx" | gcloud secrets create META_ACCESS_TOKEN --data-file=-

# Mount ke Cloud Run
gcloud run services update wassist \
  --set-secrets META_ACCESS_TOKEN=META_ACCESS_TOKEN:latest
```

---

## Setelah Deploy: Update Webhook URL

Setelah Cloud Run berhasil:

1. Copy service URL: `https://wassist-xxxxx-as.a.run.app`
2. **Update Meta webhook:**
   - developers.facebook.com → app → WhatsApp → Configuration
   - Callback URL: `https://wassist-xxxxx-as.a.run.app/api/webhook/wa`
   - Verify dan save
3. **Update Midtrans notification URL:**
   - dashboard.midtrans.com → Settings → Configuration
   - Notification URL: `https://wassist-xxxxx-as.a.run.app/api/webhook/midtrans`

---

## Test Deployment

```bash
# Test webhook verification
curl "https://wassist-xxxxx-as.a.run.app/api/webhook/wa?hub.mode=subscribe&hub.verify_token=wassist_verify_2026&hub.challenge=test123"
# Expected: "test123"

# Test KPI endpoint
curl "https://wassist-xxxxx-as.a.run.app/api/dashboard/kpi?tenant_id=00000000-0000-0000-0000-000000000001"
# Expected: JSON dengan revenue_today, order_count_today, dll
```

---

## Pentingnya --min-instances=1

Tanpa `--min-instances=1`, Cloud Run akan "tidur" saat tidak ada traffic dan "bangun" lagi saat ada request pertama (cold start ~2-5 detik). Untuk demo, ini sangat mengganggu.

Dengan `--min-instances=1`, selalu ada 1 instance aktif → response instan.

Biaya: ~$5-10/bulan untuk 1 instance selalu aktif (512Mi memory). Untuk hackathon: gratis tier biasanya cukup atau biaya minimal.

---

## Checklist Deployment

- [ ] `next.config.js` punya `output: "standalone"`
- [ ] `Dockerfile` dibuat dan tested lokal (`docker build .`)
- [ ] GCP project sudah dibuat + billing diaktifkan
- [ ] Cloud Run service berhasil di-deploy
- [ ] Env vars semua sudah di-set di Cloud Run
- [ ] Meta webhook URL sudah diupdate ke Cloud Run URL
- [ ] Midtrans notification URL sudah diupdate
- [ ] Test webhook verification → return challenge ✅
- [ ] Test kirim WA dari HP → response dari bot ✅
- [ ] Test QRIS sandbox end-to-end ✅
- [ ] Dashboard accessible via magic link ✅
