"use client";

import { useState, useEffect } from 'react';
import { Bell, Info, AlertTriangle, Calendar, Plus, Megaphone, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { AnnouncementsService } from "@/lib/api";
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

export default function FeedPage() {
    const { user } = useAuth();
    const [announcements, setAnnouncements] = useState<any[]>([]);
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
                const mappedData = data.map((ann: any) => ({
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

    const getIcon = (priority: string) => {
        switch (priority) {
            case 'alert': return AlertTriangle;
            case 'event': return Calendar;
            default: return Info;
        }
    };

    const getPriorityStyles = (priority: string) => {
        switch (priority) {
            case 'alert': return {
                badge: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 ring-red-600/20',
                icon: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
                border: 'border-l-red-500',
                glow: 'shadow-red-500/5'
            };
            case 'event': return {
                badge: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 ring-purple-600/20',
                icon: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
                border: 'border-l-purple-500',
                glow: 'shadow-purple-500/5'
            };
            default: return {
                badge: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 ring-blue-600/20',
                icon: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
                border: 'border-l-blue-500',
                glow: 'shadow-blue-500/5'
            };
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
                        <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
                            <Megaphone className="h-5 w-5 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Muro de Avisos</h1>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                        Noticias y comunicados oficiales de la comunidad
                    </p>
                </div>
                {user?.role === 'admin' && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all duration-300">
                                <Plus className="h-5 w-5" />
                                Publicar Aviso
                            </button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Nuevo Comunicado</DialogTitle>
                                <DialogDescription>Redacta un aviso para toda la comunidad.</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handlePostSubmit} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Título</label>
                                    <Input
                                        required
                                        value={newPost.title}
                                        onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                                        placeholder="Ej: Mantención de Ascensores"
                                        className="input-premium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Prioridad</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {['info', 'alert', 'event'].map((p) => {
                                            const styles = getPriorityStyles(p);
                                            const Icon = getIcon(p);
                                            return (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setNewPost({ ...newPost, priority: p })}
                                                    className={`p-3 rounded-xl border-2 transition-all ${newPost.priority === p
                                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                                                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                                        }`}
                                                >
                                                    <div className={`mx-auto w-8 h-8 rounded-lg ${styles.icon} flex items-center justify-center mb-2`}>
                                                        <Icon className="h-4 w-4" />
                                                    </div>
                                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center">{getPriorityLabel(p)}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contenido</label>
                                    <textarea
                                        className="w-full min-h-[120px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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

                            return (
                                <article
                                    key={ann.id}
                                    className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border-l-4 ${styles.border} shadow-lg dark:shadow-slate-950/50 ${styles.glow} hover:shadow-xl transition-all duration-300 animate-slide-up opacity-0`}
                                    style={{ animationDelay: `${idx * 0.1}s`, animationFillMode: 'forwards' }}
                                >
                                    <div className="p-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className={`flex-shrink-0 p-3 rounded-xl ${styles.icon}`}>
                                                    <Icon className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                        {ann.title}
                                                    </h2>
                                                    <div className="flex items-center gap-2 mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                        <span className="font-medium">{ann.author}</span>
                                                        <span>•</span>
                                                        <span>{getRelativeTime(ann.createdAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <span className={`flex-shrink-0 px-3 py-1 text-xs font-semibold rounded-full ring-1 ring-inset ${styles.badge}`}>
                                                {getPriorityLabel(ann.priority)}
                                            </span>
                                        </div>
                                        <p className="mt-4 text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap pl-16">
                                            {ann.content}
                                        </p>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </article>
                            );
                        })}

                        {announcements.length === 0 && (
                            <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl shadow-lg">
                                <Bell className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
                                <p className="text-slate-500 dark:text-slate-400">No hay avisos recientes.</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
