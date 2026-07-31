import { redirect } from "next/navigation";

export default function MyRequestsPage() {
    redirect("/services?view=requests");
}
