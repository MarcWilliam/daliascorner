import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export const STORE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
let client: SupabaseClient | undefined;
export function storeClient() {
  if (!STORE_CONFIGURED) throw new Error("Store not configured");
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  ));
}
export type SavedOrder = {
  order_number: number;
  status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: "cash" | "transfer";
  expires_at: string;
  items: {
    id: string;
    name_en: string;
    name_ar: string;
    qty: number;
    price: number;
  }[];
};
