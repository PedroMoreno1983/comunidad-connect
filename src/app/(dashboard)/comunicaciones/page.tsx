"use client";
/* eslint-disable @next/next/no-img-element -- This module renders user avatars, post previews, blob previews and Supabase-hosted community media. */

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { AnnouncementsService } from "@/lib/api";
import { ChatService } from "@/lib/services/supabaseServices";
import { SocialService } from "@/lib/services/supabaseServices";
import { Announcement, ChatMessage, Conversation, SocialPost, SocialComment } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SkeletonAnnouncement, SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog";
import {
    Megaphone, Bell, Info, AlertTriangle, Calendar, Plus,
    Hash, MessageSquare, Send, Heart, MessageCircle, Share2,
    MoreHorizontal, Image as ImageIcon, Smile, MapPin,
    Users, Loader2, ArrowLeft, Search, X as XIcon
} from "lucide-react";
import clsx from "clsx";

type Tab = "oficial" | "comunidad" | "mensajes";
type ChatMode = "global" | "direct";

const TABS: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
    { id: "oficial", label: "Oficial", icon: Megaphone, description: "Comunicados de administracion" },
    { id: "comunidad", label: "Comunidad", icon: Hash, description: "Muro social de vecinos" },
    { id: "mensajes", label: "Mensajes", icon: MessageSquare, description: "Chat vecinal" },
];

// ─── OFICIAL TAB ────────────────────────────────────────────────────────────

function OficialTab() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newPost, setNewPost] = useState({ title: "", content: "", priority: "info" });

    useEffect(() => {
        const fetch = async () => {
            try {
                setIsLoading(true);
                const data = await AnnouncementsService.getAnnouncements();
                setAnnouncements(data.map((ann: any): Announcement => ({
                    id: ann.id,
                    title: ann.title,
                    content: ann.content,
                    author: ann.author_name || "Administracion",
                    priority: ann.priority,
                    createdAt: ann.created_at,
                })));
            } catch {
                toast({ title: "Error de conexion", description: "No se pudieron cargar los comunicados.", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };
        fetch();
    }, [toast]);

    const getIcon = (priority: string) => ({ alert: AlertTriangle, event: Calendar } as Record<string, React.ElementType>)[priority] || Info;
    const getPriorityStyles = (priority: string) => ({
        alert: { badge: "bg-danger-bg text-danger-fg ring-red-600/20", icon: "bg-danger-bg text-danger-fg", border: "border-l-red-500", glow: "shadow-red-500/5" },
        event: { badge: "bg-brand-50 text-brand-700 ring-brand-600/20", icon: "bg-brand-50 text-brand-600", border: "border-l-brand-500", glow: "shadow-brand-500/5" },
    } as Record<string, any>)[priority] || { badge: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 ring-blue-600/20", icon: "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400", border: "border-l-blue-500", glow: "shadow-blue-500/5" };
    const getPriorityLabel = (p: string) => ({ alert: "Urgente", event: "Evento" } as Record<string, string>)[p] || "Informacion";
    const getRelativeTime = (d: string) => {
        const diff = Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
        if (diff < 1) return "Hace un momento";
        if (diff < 24) return `Hace ${diff}h`;
        if (diff < 48) return "Ayer";
        return new Date(d).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || user.role === "resident") {
            toast({ title: "Acceso Denegado", description: "No tienes permisos para publicar avisos.", variant: "destructive" });
            return;
        }
        try {
            const data = await AnnouncementsService.createAnnouncement({
                title: newPost.title, content: newPost.content,
                priority: newPost.priority as "info" | "alert" | "event",
                author_id: user.id, author_name: user.name || "Administracion",
            });
            setAnnouncements([{ id: data.id, title: data.title, content: data.content, author: data.author_name || "Administracion", priority: data.priority, createdAt: data.created_at }, ...announcements]);
            setIsDialogOpen(false);
            setNewPost({ title: "", content: "", priority: "info" });
            toast({ title: "Aviso publicado", description: "La notificacion ha sido enviada a todos los residentes.", variant: "success" });
        } catch {
            toast({ title: "Error", description: "Hubo un problema al publicar el aviso.", variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm font-medium cc-text-secondary">
                    Comunicados y avisos oficiales de la administracion
                </p>
                {user?.role === "admin" && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600">
                                <Plus className="h-4 w-4" /> Publicar Aviso
                            </button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Nuevo Comunicado</DialogTitle>
                                <DialogDescription>Redacta un aviso para toda la comunidad.</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium cc-text-secondary">Titulo</label>
                                    <Input required value={newPost.title} onChange={(e) => setNewPost({ ...newPost, title: e.target.value })} placeholder="Ej: Mantencion de ascensores" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium cc-text-secondary">Prioridad</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {["info", "alert", "event"].map((p) => {
                                            const styles = getPriorityStyles(p);
                                            const Icon = getIcon(p);
                                            return (
                                                <button key={p} type="button" onClick={() => setNewPost({ ...newPost, priority: p })}
                                                    className={`rounded-lg border p-3 transition-colors ${newPost.priority === p ? "border-brand-500 bg-brand-50" : "border-subtle hover:border-brand-300"}`}>
                                                    <div className={`mx-auto w-8 h-8 rounded-lg ${styles.icon} flex items-center justify-center mb-2`}><Icon className="h-4 w-4" /></div>
                                                    <p className="text-xs font-medium cc-text-secondary text-center">{getPriorityLabel(p)}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium cc-text-secondary">Contenido</label>
                                    <textarea className="w-full min-h-[120px] rounded-xl border border-subtle bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                                        required value={newPost.content} onChange={(e) => setNewPost({ ...newPost, content: e.target.value })} placeholder="Escribe el detalle del comunicado..." />
                                </div>
                                <DialogFooter><Button type="submit">Publicar</Button></DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            <div className="space-y-4">
                {isLoading ? (
                    [1, 2, 3].map((i) => <SkeletonAnnouncement key={i} />)
                ) : announcements.length === 0 ? (
                    <EmptyState icon={<Bell className="h-6 w-6" />} title="Sin Comunicados" description="No hay avisos recientes. Te notificaremos cuando haya novedades." />
                ) : (
                    announcements.map((ann, idx) => {
                        const styles = getPriorityStyles(ann.priority);
                        const Icon = getIcon(ann.priority);
                        return (
                            <article key={ann.id} className={`group relative overflow-hidden rounded-lg bg-surface border-l-4 ${styles.border} shadow-sm ${styles.glow} hover:shadow-sm transition-all duration-300 animate-slide-up opacity-0`}
                                style={{ animationDelay: `${idx * 0.1}s`, animationFillMode: "forwards" }}>
                                <div className="p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className={`flex-shrink-0 p-3 rounded-xl ${styles.icon}`}><Icon className="h-5 w-5" /></div>
                                            <div className="min-w-0">
                                                <h2 className="text-lg font-bold cc-text-primary group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{ann.title}</h2>
                                                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                                                    <span className="font-medium">{ann.author}</span>
                                                    <span>-</span>
                                                    <span>{getRelativeTime(ann.createdAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`flex-shrink-0 rounded-md px-3 py-1 text-xs font-semibold ring-1 ring-inset ${styles.badge}`}>{getPriorityLabel(ann.priority)}</span>
                                    </div>
                                    <p className="mt-4 cc-text-secondary leading-relaxed whitespace-pre-wrap pl-16">{ann.content}</p>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500/20 opacity-0 transition-opacity group-hover:opacity-100" />
                            </article>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ─── COMUNIDAD TAB ──────────────────────────────────────────────────────────

function ComunidadTab() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [posts, setPosts] = useState<SocialPost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newPostContent, setNewPostContent] = useState("");
    const [newPostImageFile, setNewPostImageFile] = useState<File | null>(null);
    const [newPostImagePreview, setNewPostImagePreview] = useState<string | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
    const [comments, setComments] = useState<Record<string, SocialComment[]>>({});
    const [newCommentContent, setNewCommentContent] = useState("");
    const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const data = await SocialService.getPosts();
                if (data) setPosts(data as SocialPost[]);
            } catch { setPosts([]); }
            finally { setIsLoading(false); }
        };
        load();
    }, []);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setNewPostImageFile(file);
        setNewPostImagePreview(URL.createObjectURL(file));
    };

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || (!newPostContent.trim() && !newPostImageFile)) return;
        setIsSubmitting(true);
        let imageUrl: string | undefined;
        if (newPostImageFile) {
            setIsUploadingImage(true);
            try {
                const ext = newPostImageFile.name.split(".").pop();
                const path = `posts/${user.id}/${Date.now()}.${ext}`;
                const { error } = await supabase.storage.from("social-images").upload(path, newPostImageFile, { upsert: false });
                if (!error) {
                    const { data: { publicUrl } } = supabase.storage.from("social-images").getPublicUrl(path);
                    imageUrl = publicUrl;
                }
            } catch { console.warn("Image upload failed"); }
            finally { setIsUploadingImage(false); }
        }
        try {
            const newPost = await SocialService.createPost({ author_id: user.id, content: newPostContent.trim(), image_url: imageUrl });
            setPosts([newPost as SocialPost, ...posts]);
            setNewPostContent(""); setNewPostImageFile(null); setNewPostImagePreview(null);
            toast({ title: "Publicado", description: "Tu publicacion ya esta visible en el muro.", variant: "success" });
        } catch {
            toast({ title: "Error", description: "Hubo un problema al publicar.", variant: "destructive" });
        } finally { setIsSubmitting(false); }
    };

    const handleLike = async (postId: string) => {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + 1, has_liked: true } : p));
        try { await SocialService.likePost(postId); }
        catch { setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) - 1), has_liked: false } : p)); }
    };

    const toggleComments = async (postId: string) => {
        if (activeCommentPostId === postId) { setActiveCommentPostId(null); return; }
        setActiveCommentPostId(postId);
        if (!comments[postId]) {
            setLoadingCommentsPostId(postId);
            try { const data = await SocialService.getComments(postId); setComments(prev => ({ ...prev, [postId]: data })); }
            catch { console.warn("Error loading comments"); }
            finally { setLoadingCommentsPostId(null); }
        }
    };

    const handleCreateComment = async (e: React.FormEvent, postId: string) => {
        e.preventDefault();
        if (!user || !newCommentContent.trim()) return;
        try {
            const comment = await SocialService.createComment({ post_id: postId, author_id: user.id, content: newCommentContent.trim() });
            setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), comment] }));
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
            setNewCommentContent("");
        } catch { toast({ title: "Error", description: "No se pudo enviar el comentario", variant: "destructive" }); }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            {/* Create Post */}
            <div className="rounded-lg border border-subtle bg-surface p-5 shadow-sm sm:p-6">
                <form onSubmit={handleCreatePost}>
                    <div className="flex gap-4 sm:gap-5">
                        <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-brand-500 text-white">
                            {user?.photo ? <img src={user.photo} alt={user.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-semibold text-lg">{user?.name.charAt(0)}</div>}
                        </div>
                        <div className="flex-1 space-y-4">
                            <textarea value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)}
                                placeholder="Comparte una novedad util para la comunidad"
                                className="min-h-[100px] w-full resize-none bg-transparent text-base font-medium cc-text-primary placeholder:text-slate-400 focus:outline-none" />
                            <div className="flex items-center justify-between pt-4 border-t border-subtle">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => imageInputRef.current?.click()} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600">
                                        {isUploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                                    </button>
                                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                                    <button type="button" className="hidden rounded-lg p-2 text-slate-400 transition-colors hover:bg-elevated sm:block"><Smile className="h-5 w-5" /></button>
                                    <button type="button" className="hidden rounded-lg p-2 text-slate-400 transition-colors hover:bg-elevated sm:block"><MapPin className="h-5 w-5" /></button>
                                </div>
                                <Button type="submit" disabled={(!newPostContent.trim() && !newPostImageFile) || isSubmitting} className="rounded-lg px-5 font-semibold">
                                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Publicar"}
                                </Button>
                            </div>
                            {newPostImagePreview && (
                                <div className="relative mt-3 rounded-lg overflow-hidden border border-subtle">
                                    <img src={newPostImagePreview} alt="preview" className="w-full max-h-64 object-cover" />
                                    <button type="button" onClick={() => { setNewPostImageFile(null); setNewPostImagePreview(null); }} className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"><XIcon className="h-4 w-4" /></button>
                                </div>
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {/* Feed */}
            {isLoading ? (<><SkeletonCard /><SkeletonCard /><SkeletonCard /></>) : posts.length === 0 ? (
                <div className="bg-canvas/50 rounded-lg border border-dashed border-subtle p-16 text-center space-y-4">
                    <MessageCircle className="h-16 w-16 text-slate-300 mx-auto" /><h3 className="text-xl font-semibold text-slate-500">Nada por aqui aun</h3>
                    <p className="text-sm font-medium text-slate-400">Se el primero en saludar a tus vecinos.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <AnimatePresence>
                        {posts.map((post) => (
                            <motion.div key={post.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                className="bg-surface flex flex-col rounded-lg border border-subtle shadow-sm overflow-hidden">
                                <div className="p-6 sm:p-8 pb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 overflow-hidden rounded-lg bg-elevated">
                                            {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-semibold text-slate-400">{post.profiles?.name?.charAt(0) || "?"}</div>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold cc-text-primary flex items-center gap-2">{post.profiles?.name || "Residente"}
                                                {post.profiles?.unit_id && <span className="rounded-md bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Depto {post.profiles.unit_id}</span>}
                                            </h3>
                                            <p className="text-xs font-semibold text-slate-400 mt-0.5">{new Date(post.created_at).toLocaleDateString()} a las {new Date(post.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                        </div>
                                    </div>
                                    <button className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-elevated"><MoreHorizontal className="h-5 w-5" /></button>
                                </div>
                                <div className="px-6 sm:px-8 py-2">
                                    <p className="cc-text-primary text-base leading-relaxed whitespace-pre-line">{post.content}</p>
                                    {post.image_url && <div className="mt-4 rounded-lg overflow-hidden border border-subtle"><img src={post.image_url} alt="post" className="w-full h-auto object-cover max-h-[500px]" /></div>}
                                </div>
                                <div className="px-6 sm:px-8 py-4 mt-2 border-t border-subtle/50 flex items-center gap-6">
                                    <button onClick={() => handleLike(post.id)} className={clsx("flex items-center gap-2 group transition-colors", post.has_liked ? "text-rose-500" : "text-slate-400 hover:text-rose-500")}>
                                        <div className={clsx("rounded-lg p-2 transition-colors", post.has_liked ? "bg-rose-50 dark:bg-rose-500/10" : "group-hover:bg-rose-50 dark:group-hover:bg-rose-500/10")}><Heart className={clsx("h-5 w-5", post.has_liked && "fill-current")} /></div>
                                        <span className="font-bold">{post.likes_count > 0 ? post.likes_count : "Me gusta"}</span>
                                    </button>
                                    <button onClick={() => toggleComments(post.id)} className="flex items-center gap-2 text-slate-400 hover:text-blue-500 group transition-colors">
                                        <div className="rounded-lg p-2 transition-colors group-hover:bg-brand-50"><MessageCircle className="h-5 w-5" /></div>
                                        <span className="font-bold">{post.comments_count ? post.comments_count : "Comentar"}</span>
                                    </button>
                                    <button className="group ml-auto flex items-center gap-2 text-slate-400 transition-colors hover:text-brand-600">
                                        <div className="rounded-lg p-2 transition-colors group-hover:bg-brand-50"><Share2 className="h-5 w-5" /></div>
                                    </button>
                                </div>
                                <AnimatePresence>
                                    {activeCommentPostId === post.id && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            className="bg-elevated/30 border-t border-subtle overflow-hidden">
                                            <div className="p-6 sm:p-8 space-y-6">
                                                {loadingCommentsPostId === post.id ? <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
                                                    <div className="space-y-5">
                                                        {(comments[post.id] || []).map((comment) => (
                                                            <div key={comment.id} className="flex gap-4">
                                                                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg bg-elevated">
                                                                    {comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} alt="av" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-slate-500">{comment.profiles?.name?.charAt(0) || "?"}</div>}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="bg-surface px-4 py-3 rounded-lg rounded-tl-none border border-subtle inline-block">
                                                                        <p className="text-xs font-semibold cc-text-primary mb-0.5">{comment.profiles?.name}</p>
                                                                        <p className="text-sm font-medium cc-text-secondary">{comment.content}</p>
                                                                    </div>
                                                                    <p className="text-[10px] font-bold text-slate-400 mt-1 ml-2">{new Date(comment.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {(comments[post.id] || []).length === 0 && <p className="text-xs font-bold text-center text-slate-400">Sé el primero en comentar.</p>}
                                                    </div>
                                                )}
                                                <div className="flex gap-3 pt-2">
                                                    <div className="hidden h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg bg-slate-300 sm:block">
                                                        {user?.photo ? <img src={user.photo} alt="U" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-white bg-slate-400">{user?.name.charAt(0)}</div>}
                                                    </div>
                                                    <form className="flex-1 relative" onSubmit={(e) => handleCreateComment(e, post.id)}>
                                                        <input type="text" placeholder="Escribe un comentario..."
                                                            className="h-10 w-full rounded-lg border border-subtle bg-surface pl-4 pr-12 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                                            value={newCommentContent} onChange={(e) => setNewCommentContent(e.target.value)} />
                                                        <button type="submit" disabled={!newCommentContent.trim()} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:bg-slate-300 disabled:opacity-50">
                                                            <Send className="h-3.5 w-3.5" />
                                                        </button>
                                                    </form>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}

// ─── MENSAJES TAB ────────────────────────────────────────────────────────────

function MensajesTab() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [mode, setMode] = useState<ChatMode>("global");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activePeer, setActivePeer] = useState<Conversation | null>(null);
    const [neighbors, setNeighbors] = useState<{ id: string; name: string; avatar_url?: string }[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    useEffect(() => {
        if (mode === "global") loadGlobalMessages();
        else { loadConversations(); loadNeighbors(); }
        return () => { subscriptionRef.current?.unsubscribe(); };
        // Conversation subscriptions are intentionally rebound only when the mode changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    useEffect(() => {
        if (activePeer && user) loadDirectMessages(activePeer.peerId);
        // Direct messages are intentionally loaded when the selected peer changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePeer]);

    const loadGlobalMessages = async () => {
        setIsLoading(true); setMessages([]); subscriptionRef.current?.unsubscribe();
        try {
            const data = await ChatService.getGlobalMessages();
            setMessages(data as unknown as ChatMessage[]);
            subscriptionRef.current = ChatService.subscribeToGlobalChat((newMsg: ChatMessage) => setMessages(prev => [...prev, newMsg]));
        } catch { setMessages([]); } finally { setIsLoading(false); }
    };

    const loadConversations = async () => {
        if (!user) return;
        try { const data = await ChatService.getConversations(user.id); setConversations(data); } catch { console.warn("Error loading conversations"); }
    };

    const loadNeighbors = async () => {
        if (!user) return;
        const { data } = await supabase.from("profiles").select("id, name, avatar_url").neq("id", user.id).order("name");
        if (data) setNeighbors(data);
    };

    const loadDirectMessages = async (peerId: string) => {
        if (!user) return;
        setIsLoading(true); setMessages([]); subscriptionRef.current?.unsubscribe();
        try {
            const data = await ChatService.getDirectMessages(user.id, peerId);
            setMessages(data as unknown as ChatMessage[]);
            subscriptionRef.current = ChatService.subscribeToDirectChat(user.id, peerId, (newMsg: ChatMessage) => setMessages(prev => [...prev, newMsg]));
        } catch { setMessages([]); } finally { setIsLoading(false); }
    };

    const openDirectChat = (neighbor: { id: string; name: string; avatar_url?: string }) => {
        setActivePeer({ peerId: neighbor.id, peerProfile: { name: neighbor.name, avatar_url: neighbor.avatar_url }, lastMessage: "", lastAt: "" });
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newMessage.trim()) return;
        setIsSending(true);
        try {
            if (mode === "global") await ChatService.sendMessage({ sender_id: user.id, content: newMessage.trim() });
            else if (activePeer) await ChatService.sendMessage({ sender_id: user.id, receiver_id: activePeer.peerId, content: newMessage.trim() });
            setNewMessage("");
        } catch { toast({ title: "Error", description: "No se pudo enviar el mensaje", variant: "destructive" }); }
        finally { setIsSending(false); }
    };

    const filtered = neighbors.filter(n => (n.name || "").toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="flex h-[calc(100vh-20rem)] overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm">
            {/* Left Sidebar */}
            <div className="hidden w-72 flex-col border-r border-subtle bg-canvas lg:flex">
                <div className="px-4 py-4">
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-elevated p-1">
                        <button onClick={() => { setMode("global"); setActivePeer(null); }} className={clsx("rounded-md px-3 py-2 text-sm font-semibold transition-colors", mode === "global" ? "bg-surface cc-text-primary shadow-sm" : "cc-text-secondary hover:bg-surface")}>General</button>
                        <button onClick={() => setMode("direct")} className={clsx("rounded-md px-3 py-2 text-sm font-semibold transition-colors", mode === "direct" ? "bg-surface cc-text-primary shadow-sm" : "cc-text-secondary hover:bg-surface")}>Directos</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {mode === "global" ? (
                        <button className="flex w-full items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-brand-700">
                            <div className="rounded-lg bg-white p-2"><Users className="h-4 w-4" /></div>
                            <div className="text-left"><p className="text-sm font-semibold">Canal general</p><p className="text-[11px] font-medium text-brand-600">Todos los vecinos</p></div>
                        </button>
                    ) : (
                        <>
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input type="text" placeholder="Buscar vecino..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full rounded-lg border border-subtle bg-surface py-2.5 pl-9 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                            </div>
                            {conversations.length > 0 && (
                                <div className="mb-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Recientes</p>
                                    {conversations.map(conv => (
                                        <button key={conv.peerId} onClick={() => setActivePeer(conv)}
                                            className={clsx("mb-1 flex w-full items-center gap-3 rounded-lg p-3 transition-colors", activePeer?.peerId === conv.peerId ? "bg-brand-50 text-brand-700" : "cc-text-secondary hover:bg-elevated")}>
                                            <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-slate-300">
                                                {conv.peerProfile?.avatar_url ? <img src={conv.peerProfile.avatar_url} alt="av" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[11px] font-semibold text-slate-500">{conv.peerProfile?.name?.charAt(0) || "?"}</div>}
                                            </div>
                                            <div className="text-left min-w-0"><p className="font-bold text-sm truncate">{conv.peerProfile?.name}</p><p className="text-[11px] text-slate-400 truncate">{conv.lastMessage}</p></div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Vecinos</p>
                            {filtered.length === 0 ? <p className="text-xs text-center text-slate-400 py-4">Sin resultados</p> : filtered.map(n => (
                                <button key={n.id} onClick={() => openDirectChat(n)}
                                    className={clsx("mb-1 flex w-full items-center gap-3 rounded-lg p-3 transition-colors", activePeer?.peerId === n.id ? "bg-brand-50" : "hover:bg-elevated")}>
                                    <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-brand-500">
                                        {n.avatar_url ? <img src={n.avatar_url} alt="av" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[11px] font-semibold text-white">{n.name?.charAt(0) || "?"}</div>}
                                    </div>
                                    <p className="font-bold text-sm cc-text-secondary truncate">{n.name}</p>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-surface relative">
                <div className="z-10 flex h-16 items-center justify-between border-b border-subtle bg-surface px-6">
                    <div className="flex items-center gap-3">
                        {mode === "direct" && activePeer && <button onClick={() => setActivePeer(null)} className="rounded-lg p-2 hover:bg-elevated"><ArrowLeft className="h-5 w-5 text-slate-400" /></button>}
                        <div className="rounded-lg bg-slate-900 p-2 shadow-sm">
                            <MessageSquare className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h3 className="font-semibold cc-text-primary">{mode === "global" ? "Chat general" : (activePeer?.peerProfile.name || "Mensajes directos")}</h3>
                            <p className="text-xs font-medium text-slate-500">{mode === "global" ? "Toda la comunidad" : (activePeer ? "Conversacion privada" : "Selecciona un vecino")}</p>
                        </div>
                    </div>
                </div>

                {mode === "direct" && !activePeer ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
                        <div className="mb-2 rounded-lg bg-brand-50 p-6"><MessageCircle className="h-14 w-14 text-brand-500" /></div>
                        <h3 className="text-xl font-semibold cc-text-primary">Mensajes directos</h3>
                        <p className="max-w-xs text-sm font-medium text-slate-400">Selecciona un vecino del panel izquierdo para iniciar una conversacion privada.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {isLoading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div> : (
                                <AnimatePresence initial={false}>
                                    {messages.length === 0 && <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center"><MessageCircle className="h-12 w-12 text-slate-200 dark:text-slate-700" /><p className="text-sm font-bold text-slate-400">Sin mensajes aun. Saluda primero.</p></div>}
                                    {messages.map((msg, idx) => {
                                        const isMe = msg.sender_id === user?.id;
                                        const prev = messages[idx - 1];
                                        const showAvatar = !isMe && (!prev || prev.sender_id !== msg.sender_id);
                                        const showTimestamp = idx === messages.length - 1 || new Date(messages[idx + 1].created_at).getTime() - new Date(msg.created_at).getTime() > 5 * 60 * 1000;
                                        return (
                                            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={clsx("flex flex-col", isMe ? "items-end" : "items-start")}>
                                                <div className={clsx("flex items-end gap-2 max-w-[85%] lg:max-w-[70%]", isMe && "flex-row-reverse")}>
                                                    {!isMe && (
                                                        <div className="mb-1 h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg bg-elevated">
                                                            {showAvatar ? (msg.profiles?.avatar_url ? <img src={msg.profiles.avatar_url} alt="av" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-slate-500">{msg.profiles?.name?.charAt(0) || "?"}</div>) : null}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col">
                                                        {!isMe && showAvatar && <span className="text-[11px] font-semibold text-slate-400 ml-1 mb-1">{msg.profiles?.name}</span>}
                                                        <div className={clsx("px-5 py-3 text-[15px] font-medium leading-relaxed",
                                                            isMe ? "rounded-lg rounded-tr-sm bg-brand-500 text-white" : "rounded-lg rounded-tl-sm border border-slate-200/50 bg-elevated cc-text-primary dark:border-slate-700/50")}>
                                                            {msg.content}
                                                        </div>
                                                    </div>
                                                </div>
                                                {showTimestamp && <span className="text-[10px] font-bold text-slate-400 mt-1.5 mx-10">{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="p-4 bg-surface border-t border-subtle">
                            <form onSubmit={handleSendMessage} className="relative flex items-center max-w-4xl mx-auto">
                                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder={mode === "global" ? "Escribe un mensaje a la comunidad..." : `Escribe a ${activePeer?.peerProfile.name}...`}
                                    className="w-full rounded-lg border border-subtle bg-elevated py-4 pl-6 pr-14 text-sm font-medium transition-all focus:ring-2 focus:ring-brand-500/30" />
                                <button type="submit" disabled={!newMessage.trim() || isSending} className="absolute right-2 rounded-md bg-brand-500 p-2.5 text-white shadow-sm transition-colors hover:bg-brand-600 disabled:opacity-50">
                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function ComunicacionesPage() {
    const [activeTab, setActiveTab] = useState<Tab>("oficial");

    return (
        <div className="max-w-5xl space-y-8">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-600">
                        {(() => { const Icon = TABS.find(t => t.id === activeTab)!.icon; return <Icon className="h-5 w-5" />; })()}
                    </div>
                    <h1 className="text-3xl font-bold cc-text-primary">Comunicaciones</h1>
                </div>
                <p className="ml-1 cc-text-secondary">Centro unificado de comunicacion de la comunidad</p>
            </div>

            {/* Tab Bar */}
            <div className="flex w-fit gap-1 rounded-lg border border-subtle bg-surface p-1 shadow-sm">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "relative flex items-center gap-2.5 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors",
                                isActive
                                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                                    : "cc-text-secondary hover:bg-elevated hover:text-slate-700 dark:hover:text-slate-200"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                    {activeTab === "oficial"   && <OficialTab />}
                    {activeTab === "comunidad" && <ComunidadTab />}
                    {activeTab === "mensajes"  && <MensajesTab />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
