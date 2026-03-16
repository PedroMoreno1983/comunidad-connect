import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "warning" | "critical" | "neutral";
  footer?: string;
};

export function MetricCard({ label, value, detail, tone, footer }: MetricCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <Badge variant={tone}>{label}</Badge>
        <CardTitle className="text-4xl">{value}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      {footer ? (
        <CardContent className="flex items-center gap-2 text-sm font-medium text-slate-500">
          {footer}
          <ArrowRight className="size-4" />
        </CardContent>
      ) : null}
    </Card>
  );
}
