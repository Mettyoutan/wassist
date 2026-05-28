# Project Structure

```text
wassist/
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   ├── wa/route.ts          ← terima pesan WA
│   │   │   └── midtrans/route.ts   ← payment callback
│   │   ├── orders/route.ts
│   │   ├── products/route.ts
│   │   ├── dashboard/
│   │   │   ├── kpi/route.ts
│   │   │   └── handoff/route.ts
│   │   └── auth/magic-link/route.ts
│   ├── dashboard/
│   │   └── page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── gemini.ts                    ← Gemini client + intent parser
│   ├── db.ts                        ← Supabase client
│   ├── session.ts                   ← WA session state (in-memory)
│   └── midtrans.ts                  ← Midtrans helper
├── types/
│   └── intent.ts                    ← TypeScript types
├── scripts/
│   └── test-intent.ts               ← test Gemini lokal
├── .env.local
└── .env.example

```
