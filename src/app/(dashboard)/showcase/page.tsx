"use client";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function ShowcasePage() {
    return (
        <ErrorBoundary name="Design Showcase">
            <div className="w-full h-[calc(100vh-140px)] min-h-[600px] border border-[var(--cc-line-strong)] bg-[var(--cc-paper)] rounded-2xl overflow-hidden shadow-md">
                <iframe
                    src="/convive-connect/index.html"
                    className="w-full h-full border-0"
                    title="Convive & Connect Redesign Showcase"
                />
            </div>
        </ErrorBoundary>
    );
}
