"use client";

import { useState, useEffect } from 'react';
import { Bell, Info, AlertTriangle, Calendar, Plus, Megaphone, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { AnnouncementsService } from "@/lib/api";
import { Announcement } from "@/lib/types";
import { SkeletonAnnouncement } from "@/components/ui/Skeleton";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
export default function FeedPage() {
    const { user } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newPost, setNewPost] = useState({ title: '', content: '', priority: 'info' });
    const { toast } = useToast();

    useEffect(() => {
        const fetchAnnouncements = async () => {
            try {
                setIsLoading(true);
                const data = await AnnouncementsService.getAnnouncements();
                // Map the snake_case data to camelCase for the UI
                const mappedData = data.map((ann: any): Announcement => ({
                    id: ann.id,
                    title: ann.title,
                    content: ann.content,
                    author: ann.author_name || 'Administración',
                    priority: ann.priority as any,
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

    const getIcon = (priority: string) => {
        switch (priority) {
            case 'alert': return AlertTriangle;
            case 'event': return Calendar;
            default: return Info;
        }
    };

    const getBadgeTone = (priority: string) => {
        switch (priority) {
            case 'alert': return 'danger';
            case 'event': return 'brand';
            default: return 'info';
        }
    };

    const getPriorityStyles = (priority: string) => {
        switch (priority) {
            case 'alert': return { icon: 'bg-danger-bg text-danger-fg' };
            case 'event': return { icon: 'bg-brand-bg text-brand-fg' };
            default: return { icon: 'bg-info-bg text-info-fg' };
        }
    };

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'alert': return 'Urgente';
            case 'event': return 'Evento';
            default: return 'Información';
        }
    };

    const handlePostSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user || user.role === 'resident') {
            toast({
                title: "Acceso Denegado",
                description: "No tienes permisos para publicar avisos.",
                variant: "destructive",
            });
            return;
        }

        try {
            const data = await AnnouncementsService.createAnnouncement({
                title: newPost.title,
                content: newPost.content,
                priority: newPost.priority as 'info' | 'alert' | 'event',
                author_id: user.id || '11111111-1111-1111-1111-111111111111',
                author_name: user.name || 'Administración'
            });

            const newAnn = {
                id: data.id,
                title: data.title,
                content: data.content,
                author: data.author_name || 'Administración',
                priority: data.priority,
                createdAt: data.created_at,
            };

            setAnnouncements([newAnn, ...announcements]);
            setIsDialogOpen(false);
            setNewPost({ title: '', content: '', priority: 'info' });
            toast({
                title: "Aviso Publicado",
                description: "La notificación ha sido enviada a todos los residentes.",
                variant: "success",
            });
        } catch (error) {
            console.error("Error creating post:", error);
            toast({
                title: "Error",
                description: "Hubo un problema al publicar el aviso.",
                variant: "destructive",
            });
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

    return (
        <div className="max-w-4xl space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-brand-bg text-brand-fg rounded-xl">
                            <Megaphone className="h-5 w-5" />
                        </div>
                        <h1 className="text-3xl font-bold text-primary">Muro de Avisos</h1>
                    </div>
                    <p className="text-secondary">
                        Noticias y comunicados oficiales de la comunidad
                    </p>
                </div>
                {user?.role === 'admin' && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="primary" size="md" className="font-semibold shadow-md">
                                <Plus className="h-5 w-5 mr-2" />
                                Publicar Aviso
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Nuevo Comunicado</DialogTitle>
                                <DialogDescription>Redacta un aviso para toda la comunidad.</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handlePostSubmit} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium cc-text-secondary">Título</label>
                                    <Input
                                        required
                                        value={newPost.title}
                                        onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                                        placeholder="Ej: Mantención de Ascensores"
                                        className="input-premium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium cc-text-secondary">Prioridad</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {['info', 'alert', 'event'].map((p) => {
                                            const styles = getPriorityStyles(p);
                                            const Icon = getIcon(p);
                                            return (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setNewPost({ ...newPost, priority: p })}
                                                    className={`p-3 rounded-xl border transition-all ${newPost.priority === p
                                                        ? 'border-brand-500 bg-brand-bg'
                                                        : 'border-subtle hover:bg-elevated'
                                                        }`}
                                                >
                                                    <div className={`mx-auto w-8 h-8 rounded-lg ${styles.icon} flex items-center justify-center mb-2`}>
                                                        <Icon className="h-4 w-4" />
                                                    </div>
                                                    <p className="text-xs font-medium text-primary text-center">{getPriorityLabel(p)}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium cc-text-secondary">Contenido</label>
                                    <textarea
                                        className="w-full min-h-[120px] rounded-xl border border-subtle bg-surface px-4 py-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                                        required
                                        value={newPost.content}
                                        onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                                        placeholder="Escribe el detalle del comunicado..."
                                    />
                                </div>
                                <DialogFooter>
                                    <Button type="submit">Publicar</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Announcements List */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <SkeletonAnnouncement key={i} />
                        ))}
                    </div>
                ) : (
                    <>
                        {announcements.map((ann, idx) => {
                            const styles = getPriorityStyles(ann.priority);
                            const Icon = getIcon(ann.priority);

                            const tone = getBadgeTone(ann.priority);

                            return (
                                <article
                                    key={ann.id}
                                    className="group relative overflow-hidden rounded-2xl bg-surface border border-subtle shadow-md hover:shadow-lg hover:border-default transition-all duration-300 animate-slide-up opacity-0"
                                    style={{ animationDelay: `${idx * 0.1}s`, animationFillMode: 'forwards' }}
                                >
                                    <div className="p-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className={`flex-shrink-0 p-3 rounded-xl ${styles.icon}`}>
                                                    <Icon className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h2 className="text-lg font-bold text-primary group-hover:text-brand-500 transition-colors">
                                                        {ann.title}
                                                    </h2>
                                                    <div className="flex items-center gap-2 mt-1 text-sm text-tertiary">
                                                        <span className="font-medium">{ann.author}</span>
                                                        <span>•</span>
                                                        <span>{getRelativeTime(ann.createdAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <Badge variant={tone as any} dot={ann.priority === 'alert'}>
                                                {getPriorityLabel(ann.priority)}
                                            </Badge>
                                        </div>
                                        <p className="mt-4 text-secondary leading-relaxed whitespace-pre-wrap pl-16">
                                            {ann.content}
                                        </p>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </article>
                            );
                        })}

                        {announcements.length === 0 && (
                            <div className="pt-6">
                                <EmptyState
                                    icon={<Bell className="h-6 w-6" />}
                                    title="Sin Comunicados"
                                    description="No hay avisos recientes para la comunidad. Te notificaremos cuando haya novedades."
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
