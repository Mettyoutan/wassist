export type Tenant = {
  id: string;
  name: string;
  owner_phone: string;                // "6281234567890"
  wa_business_phone_id: string;       // Phone Number ID dari Meta
  category: string;                   // "fashion & pakaian" — dipakai di LLM prompt context
  plan: "TRIAL" | "STARTER" | "PRO" | "BUSINESS";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  is_open: boolean;
  closed_until: string | null;        // ISO timestamp atau null
  meta_catalog_id: string | null;     // Catalog ID di Commerce Manager, null = belum setup
  created_at: string;
};
