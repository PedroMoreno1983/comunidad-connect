import { StatCard } from "@/components/ui/StatCard";
import { Users } from "lucide-react";

export default function Page() {
  return (
    <div className="p-20 bg-slate-900 dark">
      <StatCard icon={<Users />} label="Test" value="100" />
    </div>
  );
}
