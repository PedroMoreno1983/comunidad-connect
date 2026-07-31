import { redirect } from "next/navigation";

export default function MyMarketplaceListingsPage() {
    redirect("/marketplace?view=mine");
}
