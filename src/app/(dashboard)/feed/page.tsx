"use client";

import { useState, useEffect } from 'react';
import { Bell, AlertTriangle } from "lucide-react";
import { AnnouncementsService } from "@/lib/api";
import { Announcement } from "@/lib/types";
import { SkeletonAnnouncement } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { Tag } from "@/components/cc/Tag";

type FilterTab = 'all' | 'alert' | 'event' | 'info';
type AnnouncementRow = {
    id: string;
    title: string;
    content: string;
    author_name?: string | null;
    priority: Announcement["priority"];
    created_at: string;
};

export default function FeedPage() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<FilterTab>('all');
    const { toast } = useToast();

    useEffect(() => {
        const fetchAnnouncements = async () => {
            try {
                setIsLoading(true);
                const data = await AnnouncementsService.getAnnouncements();
                const mappedData = (data as AnnouncementRow[]).map((ann): Announcement => ({
                    id: ann.id,
                    title: ann.title,
                    content: ann.content,
                    author: ann.author_name || 'Administración',
                    priority: ann.priority,
                    createdAt: ann.created_at,
                }));

                setAnnouncements(mappedData);
            } catch (error) {
                console.error("Error al cargar anuncios:", error);
                toast({
                    title: "Error de Conexión",
                    description: "No se pudieron cargar los comunicados.",
                    variant: "destructive",
                });
            } finally {
                setIsLoading(false);
            }
        };

        fetchAnnouncements();
    }, [toast]);

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'alert': return 'Urgente';
            case 'event': return 'Mantención';
            default: return 'Comunidad';
        }
    };

    const getPriorityTone = (priority: string): "rose" | "amber" | "sage" | "plum" | "copper" | "neutral" => {
        switch (priority) {
            case 'alert': return 'rose';
            case 'event': return 'amber';
            default: return 'sage';
        }
    };

    const getPriorityLeftColor = (priority: string) => {
        switch (priority) {
            case 'alert': return 'var(--cc-rose)';
            case 'event': return 'var(--cc-amber)';
            default: return 'var(--cc-sage)';
        }
    };

    const getRelativeTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

        if (diffInHours < 1) return 'Hace un momento';
        if (diffInHours < 24) return `Hace ${diffInHours}h`;
        if (diffInHours < 48) return 'Ayer';
        return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    };

    // Pinned announcement is the newest "alert" or just the first announcement if no alert is present
    const pinnedAnn = announcements.find(a => a.priority === 'alert');

    // Filter announcements by active tab
    const filteredAnnouncements = announcements.filter(ann => {
        if (activeTab === 'all') return true;
        return ann.priority === activeTab;
    });

    // Counts
    const counts = {
        all: announcements.length,
        alert: announcements.filter(a => a.priority === 'alert').length,
        event: announcements.filter(a => a.priority === 'event').length,
        info: announcements.filter(a => a.priority === 'info').length,
    };

    return (
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-8">
            {/* Header */}
            <div className="border-b border-subtle pb-6">
                <Eyebrow>Oficial</Eyebrow>
                <DisplayHeading size={36} className="mt-2">
                    Muro de <em className="text-italic-serif text-brand-600">comunicados</em>
                </DisplayHeading>
                <p className="mt-2 text-sm cc-text-secondary">
                    Noticias y comunicados oficiales emitidos por la administración.
                </p>
            </div>

            {/* Pinned announcement: card dark ink con halo amber */}
            {pinnedAnn && activeTab === 'all' && (
                <div className="space-y-3">
                    <Eyebrow className="text-xs">Destacado</Eyebrow>
                    <article className="relative overflow-hidden rounded-xl bg-slate-950 text-white p-6 shadow-[0_0_30px_rgba(201,154,74,0.16)] border border-white/10">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-white/10 text-brand-300 rounded-xl">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-xl font-bold text-white leading-tight">
                                        {pinnedAnn.title}
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {pinnedAnn.author} • {getRelativeTime(pinnedAnn.createdAt)}
                                    </p>
                                </div>
                            </div>
                            <Tag tone="amber" solid>Fijado</Tag>
                        </div>
                        <p className="mt-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap pl-14">
                            {pinnedAnn.content}
                        </p>
                    </article>
                </div>
            )}

            {/* Tabs con contador mono */}
            <div className="flex flex-wrap gap-2 border-b border-subtle pb-2">
                {[
                    { id: 'all' as FilterTab, label: 'Todos' },
                    { id: 'alert' as FilterTab, label: 'Urgentes' },
                    { id: 'event' as FilterTab, label: 'Mantención' },
                    { id: 'info' as FilterTab, label: 'Comunidad' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                            activeTab === tab.id
                                ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                : 'bg-surface text-slate-600 border-subtle hover:border-brand-200'
                        }`}
                    >
                        {tab.label}
                        <span className={`font-mono text-[10px] ${activeTab === tab.id ? 'text-white/80' : 'text-slate-400'}`}>
                            [{counts[tab.id]}]
                        </span>
                    </button>
                ))}
            </div>

            {/* List with left-bar colored by category, emojis removed */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <SkeletonAnnouncement key={i} />
                        ))}
                    </div>
                ) : filteredAnnouncements.length === 0 ? (
                    <div className="pt-6">
                        <EmptyState
                            icon={<Bell className="h-6 w-6" />}
                            title="Muro limpio"
                            description="No hay avisos en esta sección en este momento."
                        />
                    </div>
                ) : (
                    filteredAnnouncements.map((ann) => {
                        // Skip rendering the pinned alert in the main list under 'all' to avoid duplication
                        if (activeTab === 'all' && pinnedAnn && ann.id === pinnedAnn.id) return null;

                        const tone = getPriorityTone(ann.priority);
                        const leftColor = getPriorityLeftColor(ann.priority);

                        return (
                            <article
                                key={ann.id}
                                className="group relative overflow-hidden rounded-xl bg-surface border border-subtle shadow-sm hover:border-brand-200 transition-all"
                                style={{ borderLeft: `4px solid ${leftColor}` }}
                            >
                                <div className="p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className="min-w-0">
                                                <h2 className="text-lg font-bold cc-text-primary group-hover:text-brand-600 transition-colors leading-tight">
                                                    {ann.title}
                                                </h2>
                                                <div className="flex items-center gap-2 mt-1 text-xs cc-text-tertiary">
                                                    <span className="font-semibold">{ann.author}</span>
                                                    <span>•</span>
                                                    <span>{getRelativeTime(ann.createdAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <Tag tone={tone} solid>
                                            {getPriorityLabel(ann.priority)}
                                        </Tag>
                                    </div>
                                    <p className="mt-4 text-xs sm:text-sm cc-text-secondary leading-relaxed whitespace-pre-wrap">
                                        {ann.content}
                                    </p>
                                </div>
                            </article>
                        );
                    })
                )}
            </div>
        </div>
    );
}
