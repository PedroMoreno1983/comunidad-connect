"use client";

import { useState, useEffect } from "react";
import { getApiUrl, API_BASE_URL } from "@/lib/config";

export function DebugStats() {
    const [stats, setStats] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Toggle with Alt+Shift+D
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && e.shiftKey && e.key === 'D') {
                setIsVisible(v => !v);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (!isVisible) return;

        const checkApis = async () => {
            const results: any = {
                env: {
                    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "not set",
                    API_BASE_URL: API_BASE_URL,
                    window_origin: typeof window !== 'undefined' ? window.origin : 'N/A',
                },
                endpoints: {}
            };

            const apis = ['/api/coco', '/api/payments/create-haulmer-link'];
            
            for (const path of apis) {
                const url = getApiUrl(path);
                try {
                    const start = performance.now();
                    const res = await fetch(url, { 
                        method: 'POST', 
                        body: JSON.stringify({ test: true }),
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const end = performance.now();
                    results.endpoints[path] = {
                        status: res.status,
                        ok: res.ok,
                        time: `${Math.round(end - start)}ms`,
                        url_used: url
                    };
                } catch (e: any) {
                    results.endpoints[path] = {
                        error: e.message,
                        url_used: url
                    };
                }
            }
            setStats(results);
        };

        checkApis();
    }, [isVisible]);

    if (!isVisible) return null;

    return (
        <div className="fixed top-20 right-4 z-[9999] w-96 bg-black/90 text-green-400 p-4 rounded-2xl font-mono text-[10px] shadow-2xl border border-green-500/30 overflow-auto max-h-[80vh]">
            <div className="flex justify-between items-center mb-4 border-b border-green-500/20 pb-2">
                <span className="font-bold">SYSTEM DIAGNOSTICS (Alt+Shift+D)</span>
                <button onClick={() => setIsVisible(false)} className="text-red-500">CLOSE</button>
            </div>
            
            <pre>{JSON.stringify(stats, null, 2)}</pre>
            
            <div className="mt-4 p-2 bg-green-500/10 rounded">
                <p className="text-white font-bold">Performance Tips:</p>
                <ul className="list-disc list-inside space-y-1 mt-1 opacity-80">
                    <li>Using absolute API URLs: {stats?.endpoints?.['/api/coco']?.url_used?.startsWith('http') ? 'YES' : 'NO'}</li>
                    <li>Environment: {process.env.NODE_ENV}</li>
                </ul>
            </div>
        </div>
    );
}
