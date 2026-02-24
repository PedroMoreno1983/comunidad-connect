"use client";

import { Play, Pause } from "lucide-react";
import { useState, useEffect } from "react";

interface AudioMessageProps {
    duration: string;
    isSender?: boolean;
}

export function AudioMessage({ duration, isSender = false }: AudioMessageProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 100) {
                        setIsPlaying(false);
                        return 0;
                    }
                    return prev + 2;
                });
            }, 100);
        }
        return () => clearInterval(interval);
    }, [isPlaying]);

    return (
        <div className="flex items-center gap-3 min-w-[200px]">
            <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-2 rounded-full transition-colors ${isSender ? "text-emerald-500 bg-white" : "text-slate-500 bg-slate-200 dark:bg-slate-700"
                    }`}
            >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            <div className="flex-1 space-y-1">
                <div className={`h-1 rounded-full overflow-hidden ${isSender ? "bg-emerald-700/30" : "bg-slate-300 dark:bg-slate-600"}`}>
                    <div
                        className={`h-full transition-all duration-100 ${isSender ? "bg-emerald-100" : "bg-slate-500 dark:bg-slate-400"}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className={`flex justify-between text-[10px] font-medium ${isSender ? "text-emerald-100" : "text-slate-400"}`}>
                    <span>{isPlaying ? "Reproduciendo..." : duration}</span>
                    {/* Visual waves mock */}
                    <div className="flex gap-0.5 items-end h-2">
                        {[1, 3, 2, 4, 2, 3, 1, 2, 4, 2].map((h, i) => (
                            <div key={i} className={`w-0.5 rounded-full ${isSender ? "bg-emerald-100/50" : "bg-slate-400/50"}`} style={{ height: `${h * 25}%` }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
