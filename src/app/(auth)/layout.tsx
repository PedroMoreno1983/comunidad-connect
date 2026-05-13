import { AppProviders } from "@/components/AppProviders";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppProviders>{children}</AppProviders>;
}
