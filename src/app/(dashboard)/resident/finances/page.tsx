import { redirect } from "next/navigation";
import type { LegacyRedirectPageProps } from "@/lib/types";

export default async function LegacyResidentFinancesPage({
  searchParams,
}: LegacyRedirectPageProps) {
  const params = new URLSearchParams();
  const incoming = await searchParams;
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value) params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/expenses?${query}` : "/expenses");
}
