"use client";

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

const TABS: { id: Tab; label: string; icon: React.ElementType; color: string; description: string }[] = [
    { id: "oficial",    label: "Oficial",    icon: Megaphone,    color: "indigo",  description: "Comunicados de administración" },
    { id: "comunidad",  label: "Comunidad",  icon: Hash,         color: "fuchsia", description: "Muro social de vecinos" },
    { id: "mensajes",   label: "Mensajes",   icon: MessageSquare, color: "emerald", description: "Chat vecinal" },
];

const TAB_COLORS: Record<Tab, { active: string; badge: string; icon: string }> = {
    oficial:   { active: "from-indigo-500 to-purple-600",  badge: "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",  icon: "bg-gradient-to-br from-indigo-500 to-purple-600"  },
    comunidad: { active: "from-fuchsia-500 to-pink-600",   badge: "bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300", icon: "bg-gradient-to-br from-fuchsia-500 to-pink-600"   },
    mensajes:  { active: "from-emerald-500 to-teal-600",   badge: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300", icon: "bg-gradient-to-br from-emerald-500 to-teal-600"   },
};

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
                    author: ann.author_name || "Administración",
                    priority: ann.priority,
                    createdAt: ann.created_at,
                })));
            } catch {
                toast({ title: "Error de Conexión", description: "No se pudieron cargar los comunicados.", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };
        fetch();
    }, [toast]);

    const getIcon = (priority: string) => ({ alert: AlertTriangle, event: Calendar } as Record<string, React.ElementType>)[priority] || Info;
    const getPriorityStyles = (priority: string) => ({
        alert: { badge: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 ring-red-600/20", icon: "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400", border: "border-l-red-500", glow: "shadow-red-500/5" },
        event: { badge: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 ring-purple-600/20", icon: "bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400", border: "border-l-purple-500", glow: "shadow-purple-500/5" },
    } as Record<string, any>)[priority] || { badge: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 ring-blue-600/20", icon: "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400", border: "border-l-blue-500", glow: "shadow-blue-500/5" };
    const getPriorityLabel = (p: string) => ({ alert: "Urgente", event: "Evento" } as Record<string, string>)[p] || "Información";
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
                author_id: user.id, author_name: user.name || "Administración",
            });
            setAnnouncements([{ id: data.id, title: data.title, content: data.content, author: data.author_name || "Administración", priority: data.priority, createdAt: data.created_at }, ...announcements]);
            setIsDialogOpen(false);
            setNewPost({ title: "", content: "", priority: "info" });
            toast({ title: "Aviso Publicado", description: "La notificación ha sido enviada a todos los residentes.", variant: "success" });
        } catch {
            toast({ title: "Error", description: "Hubo un problema al publicar el aviso.", variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Comunicados y avisos oficiales de la administración
                </p>
                {user?.role === "admin" && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
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
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Título</label>
                                    <Input required value={newPost.title} onChange={(e) => setNewPost({ ...newPost, title: e.target.value })} placeholder="Ej: Mantención de Ascensores" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Prioridad</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {["info", "alert", "event"].map((p) => {
                                            const styles = getPriorityStyles(p);
                                            const Icon = getIcon(p);
                                            return (
                                                <button key={p} type="button" onClick={() => setNewPost({ ...newPost, priority: p })}
                                                    className={`p-3 rounded-xl border-2 transition-all ${newPost.priority === p ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
                                                    <div className={`mx-auto w-8 h-8 rounded-lg ${styles.icon} flex items-center justify-center mb-2`}><Icon className="h-4 w-4" /></div>
                                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center">{getPriorityLabel(p)}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contenido</label>
                                    <textarea className="w-full min-h-[120px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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
                    <EmptyState icon={Bell} title="Sin Comunicados" description="No hay avisos recientes. Te notificaremos cuando haya novedades." />
                ) : (
                    announcements.map((ann, idx) => {
                        const styles = getPriorityStyles(ann.priority);
                        const Icon = getIcon(ann.priority);
                        return (
                            <article key={ann.id} className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border-l-4 ${styles.border} shadow-lg ${styles.glow} hover:shadow-xl transition-all duration-300 animate-slide-up opacity-0`}
                                style={{ animationDelay: `${idx * 0.1}s`, animationFillMode: "forwards" }}>
                                <div className="p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className={`flex-shrink-0 p-3 rounded-xl ${styles.icon}`}><Icon className="h-5 w-5" /></div>
                                            <div className="min-w-0">
                                                <h2 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{ann.title}</h2>
                                                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                                                    <span className="font-medium">{ann.author}</span>
                                                    <span>•</span>
                                                    <span>{getRelativeTime(ann.createdAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`flex-shrink-0 px-3 py-1 text-xs font-semibold rounded-full ring-1 ring-inset ${styles.badge}`}>{getPriorityLabel(ann.priority)}</span>
                                    </div>
                                    <p className="mt-4 text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap pl-16">{ann.content}</p>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
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
            } catch { console.error("Image upload failed"); }
            finally { setIsUploadingImage(false); }
        }
        try {
            const newPost = await SocialService.createPost({ author_id: user.id, content: newPostContent.trim(), image_url: imageUrl });
            setPosts([newPost as SocialPost, ...posts]);
            setNewPostContent(""); setNewPostImageFile(null); setNewPostImagePreview(null);
            toast({ title: "Publicado", description: "Tu publicación ya está visible en el muro.", variant: "success" });
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
            catch { console.error("Error loading comments"); }
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
        <div className="max-w-3xl mx-auto space-y-8">
            {/* Create Post */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 sm:p-8 border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none">
                <form onSubmit={handleCreatePost}>
                    <div className="flex gap-4 sm:gap-6">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500 to-pink-500 flex-shrink-0 border-2 border-white dark:border-slate-800 shadow-md">
                            {user?.photo ? <img src={user.photo} alt={user.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-black text-lg">{user?.name.charAt(0)}</div>}
                        </div>
                        <div className="flex-1 space-y-4">
                            <textarea value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)}
                                placeholder="¿Qué está pasando en el edificio?"
                                className="w-full min-h-[100px] resize-none bg-transparent text-lg font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
                            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => imageInputRef.current?.click()} className="p-2 text-slate-400 hover:text-fuchsia-500 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-500/10 rounded-full transition-colors">
                                        {isUploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                                    </button>
                                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                                    <button type="button" className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-full transition-colors hidden sm:block"><Smile className="h-5 w-5" /></button>
                                    <button type="button" className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-full transition-colors hidden sm:block"><MapPin className="h-5 w-5" /></button>
                                </div>
                                <Button type="submit" disabled={(!newPostContent.trim() && !newPostImageFile) || isSubmitting} className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full px-6 font-bold shadow-lg hover:scale-105 transition-transform">
                                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Publicar"}
                                </Button>
                            </div>
                            {newPostImagePreview && (
                                <div className="relative mt-3 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                                    <img src={newPostImagePreview} alt="preview" className="w-full max-h-64 object-cover" />
                                    <button type="button" onClick={() => { setNewPostImageFile(null); setNewPostImagePreview(null); }} className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"><XIcon className="h-4 w-4" /></button>
                                </div>
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {/* Feed */}
            {isLoading ? (<><SkeletonCard /><SkeletonCard /><SkeletonCard /></>) : posts.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-800 p-16 text-center space-y-4">
                    <MessageCircle className="h-16 w-16 text-slate-300 mx-auto" /><h3 className="text-xl font-black text-slate-500">Nada por aquí aún</h3>
                    <p className="text-sm font-medium text-slate-400">Sé el primero en saludar a tus vecinos.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <AnimatePresence>
                        {posts.map((post) => (
                            <motion.div key={post.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                className="bg-white dark:bg-slate-900 flex flex-col rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-lg overflow-hidden">
                                <div className="p-6 sm:p-8 pb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                                            {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-black text-slate-400">{post.profiles?.name?.charAt(0) || "?"}</div>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">{post.profiles?.name || "Residente"}
                                                {post.profiles?.unit_id && <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">Depto {post.profiles.unit_id}</span>}
                                            </h3>
                                            <p className="text-xs font-semibold text-slate-400 mt-0.5">{new Date(post.created_at).toLocaleDateString()} a las {new Date(post.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                        </div>
                                    </div>
                                    <button className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><MoreHorizontal className="h-5 w-5" /></button>
                                </div>
                                <div className="px-6 sm:px-8 py-2">
                                    <p className="text-slate-800 dark:text-slate-200 text-base leading-relaxed whitespace-pre-line">{post.content}</p>
                                    {post.image_url && <div className="mt-4 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800"><img src={post.image_url} alt="post" className="w-full h-auto object-cover max-h-[500px]" /></div>}
                                </div>
                                <div className="px-6 sm:px-8 py-4 mt-2 border-t border-slate-50 dark:border-slate-800/50 flex items-center gap-6">
                                    <button onClick={() => handleLike(post.id)} className={clsx("flex items-center gap-2 group transition-colors", post.has_liked ? "text-rose-500" : "text-slate-400 hover:text-rose-500")}>
                                        <div className={clsx("p-2 rounded-full transition-all", post.has_liked ? "bg-rose-50 dark:bg-rose-500/10" : "group-hover:bg-rose-50 dark:group-hover:bg-rose-500/10")}><Heart className={clsx("h-5 w-5", post.has_liked && "fill-current")} /></div>
                                        <span className="font-bold">{post.likes_count > 0 ? post.likes_count : "Me gusta"}</span>
                                    </button>
                                    <button onClick={() => toggleComments(post.id)} className="flex items-center gap-2 text-slate-400 hover:text-blue-500 group transition-colors">
                                        <div className="p-2 rounded-full transition-all group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10"><MessageCircle className="h-5 w-5" /></div>
                                        <span className="font-bold">{post.comments_count ? post.comments_count : "Comentar"}</span>
                                    </button>
                                    <button className="flex items-center gap-2 text-slate-400 hover:text-emerald-500 group transition-colors ml-auto">
                                        <div className="p-2 rounded-full transition-all group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10"><Share2 className="h-5 w-5" /></div>
                                    </button>
                                </div>
                                <AnimatePresence>
                                    {activeCommentPostId === post.id && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            className="bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 overflow-hidden">
                                            <div className="p-6 sm:p-8 space-y-6">
                                                {loadingCommentsPostId === post.id ? <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
                                                    <div className="space-y-5">
                                                        {(comments[post.id] || []).map((comment) => (
                                                            <div key={comment.id} className="flex gap-4">
                                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-300 dark:bg-slate-700 flex-shrink-0">
                                                                    {comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} alt="av" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-500">{comment.profiles?.name?.charAt(0) || "?"}</div>}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 inline-block">
                                                                        <p className="text-xs font-black text-slate-900 dark:text-white mb-0.5">{comment.profiles?.name}</p>
                                                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{comment.content}</p>
                                                                    </div>
                                                                    <p className="text-[10px] font-bold text-slate-400 mt-1 ml-2">{new Date(comment.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {(comments[post.id] || []).length === 0 && <p className="text-xs font-bold text-center text-slate-400">Sé el primero en comentar.</p>}
                                                    </div>
                                                )}
                                                <div className="flex gap-3 pt-2">
                                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-300 flex-shrink-0 hidden sm:block">
                                                        {user?.photo ? <img src={user.photo} alt="U" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-white bg-slate-400">{user?.name.charAt(0)}</div>}
                                                    </div>
                                                    <form className="flex-1 relative" onSubmit={(e) => handleCreateComment(e, post.id)}>
                                                        <input type="text" placeholder="Escribe un comentario..."
                                                            className="w-full h-10 pl-4 pr-12 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                            value={newCommentContent} onChange={(e) => setNewCommentContent(e.target.value)} />
                                                        <button type="submit" disabled={!newCommentContent.trim()} className="absolute right-1 top-1 w-8 h-8 flex items-center justify-center bg-blue-500 text-white rounded-full disabled:opacity-50 disabled:bg-slate-300 transition-all hover:scale-105">
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
    }, [mode]);

    useEffect(() => { if (activePeer && user) loadDirectMessages(activePeer.peerId); }, [activePeer]);

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
        try { const data = await ChatService.getConversations(user.id); setConversations(data); } catch { console.error("Error loading conversations"); }
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
        <div className="h-[calc(100vh-20rem)] flex shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 rounded-[2.5rem] bg-white dark:bg-slate-900 overflow-hidden">
            {/* Left Sidebar */}
            <div className="hidden lg:flex flex-col w-72 border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="px-4 py-4">
                    <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 gap-1">
                        <button onClick={() => { setMode("global"); setActivePeer(null); }} className={clsx("py-2 px-3 rounded-xl text-sm font-bold transition-all", mode === "global" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}>🌐 Global</button>
                        <button onClick={() => setMode("direct")} className={clsx("py-2 px-3 rounded-xl text-sm font-bold transition-all", mode === "direct" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}>💬 Directos</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {mode === "global" ? (
                        <button className="w-full flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 rounded-xl"><Users className="h-4 w-4" /></div>
                            <div className="text-left"><p className="font-bold text-sm">Canal General</p><p className="text-[11px] font-medium text-emerald-400">Todos los vecinos</p></div>
                        </button>
                    ) : (
                        <>
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input type="text" placeholder="Buscar vecino..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                            </div>
                            {conversations.length > 0 && (
                                <div className="mb-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Recientes</p>
                                    {conversations.map(conv => (
                                        <button key={conv.peerId} onClick={() => setActivePeer(conv)}
                                            className={clsx("w-full flex items-center gap-3 p-3 rounded-2xl transition-all mb-1", activePeer?.peerId === conv.peerId ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300")}>
                                            <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-300 flex-shrink-0">
                                                {conv.peerProfile?.avatar_url ? <img src={conv.peerProfile.avatar_url} alt="av" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-slate-500">{conv.peerProfile?.name?.charAt(0) || "?"}</div>}
                                            </div>
                                            <div className="text-left min-w-0"><p className="font-bold text-sm truncate">{conv.peerProfile?.name}</p><p className="text-[11px] text-slate-400 truncate">{conv.lastMessage}</p></div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Vecinos</p>
                            {filtered.length === 0 ? <p className="text-xs text-center text-slate-400 py-4">Sin resultados</p> : filtered.map(n => (
                                <button key={n.id} onClick={() => openDirectChat(n)}
                                    className={clsx("w-full flex items-center gap-3 p-3 rounded-2xl transition-all mb-1", activePeer?.peerId === n.id ? "bg-emerald-50 dark:bg-emerald-500/10" : "hover:bg-slate-100 dark:hover:bg-slate-800")}>
                                    <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-emerald-400 to-teal-500 flex-shrink-0">
                                        {n.avatar_url ? <img src={n.avatar_url} alt="av" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-white">{n.name?.charAt(0) || "?"}</div>}
                                    </div>
                                    <p className="font-bold text-sm text-slate-700 dark:text-slate-300 truncate">{n.name}</p>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 relative">
                <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md z-10">
                    <div className="flex items-center gap-3">
                        {mode === "direct" && activePeer && <button onClick={() => setActivePeer(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-5 w-5 text-slate-400" /></button>}
                        <div className={clsx("p-2 rounded-xl", mode === "global" ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30" : "bg-gradient-to-br from-teal-500 to-cyan-600 shadow-teal-500/30", "shadow-lg")}>
                            <MessageSquare className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 dark:text-white">{mode === "global" ? "Chat Global" : (activePeer?.peerProfile.name || "Mensajes Directos")}</h3>
                            <p className="text-xs font-medium text-slate-500">{mode === "global" ? "Toda la comunidad" : (activePeer ? "1‑a‑1 privado" : "Selecciona un vecino")}</p>
                        </div>
                    </div>
                </div>

                {mode === "direct" && !activePeer ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
                        <div className="p-6 bg-emerald-50 dark:bg-emerald-500/10 rounded-3xl mb-2"><MessageCircle className="h-14 w-14 text-emerald-400" /></div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Mensajes Directos</h3>
                        <p className="text-sm font-medium text-slate-400 max-w-xs">Selecciona un vecino del panel izquierdo para iniciar una conversación privada.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {isLoading ? <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div> : (
                                <AnimatePresence initial={false}>
                                    {messages.length === 0 && <div className="flex flex-col items-center justify-center h-full py-16 text-center gap-3"><MessageCircle className="h-12 w-12 text-slate-200 dark:text-slate-700" /><p className="text-sm font-bold text-slate-400">Sin mensajes aún. ¡Saluda primero!</p></div>}
                                    {messages.map((msg, idx) => {
                                        const isMe = msg.sender_id === user?.id;
                                        const prev = messages[idx - 1];
                                        const showAvatar = !isMe && (!prev || prev.sender_id !== msg.sender_id);
                                        const showTimestamp = idx === messages.length - 1 || new Date(messages[idx + 1].created_at).getTime() - new Date(msg.created_at).getTime() > 5 * 60 * 1000;
                                        return (
                                            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={clsx("flex flex-col", isMe ? "items-end" : "items-start")}>
                                                <div className={clsx("flex items-end gap-2 max-w-[85%] lg:max-w-[70%]", isMe && "flex-row-reverse")}>
                                                    {!isMe && (
                                                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-slate-200 dark:bg-slate-800 mb-1">
                                                            {showAvatar ? (msg.profiles?.avatar_url ? <img src={msg.profiles.avatar_url} alt="av" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-500">{msg.profiles?.name?.charAt(0) || "?"}</div>) : null}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col">
                                                        {!isMe && showAvatar && <span className="text-[11px] font-black text-slate-400 ml-1 mb-1">{msg.profiles?.name}</span>}
                                                        <div className={clsx("px-5 py-3 text-[15px] font-medium leading-relaxed drop-shadow-sm",
                                                            isMe ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl rounded-tr-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm border border-slate-200/50 dark:border-slate-700/50")}>
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
                        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                            <form onSubmit={handleSendMessage} className="relative flex items-center max-w-4xl mx-auto">
                                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder={mode === "global" ? "Escribe un mensaje a la comunidad..." : `Escribe a ${activePeer?.peerProfile.name}...`}
                                    className="w-full pl-6 pr-14 py-4 bg-slate-100 dark:bg-slate-800 border-none rounded-full text-sm font-medium focus:ring-2 focus:ring-emerald-500/50 transition-all shadow-inner" />
                                <button type="submit" disabled={!newMessage.trim() || isSending} className="absolute right-2 p-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full disabled:opacity-50 disabled:grayscale transition-all hover:scale-105 shadow-md">
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
    const activeColors = TAB_COLORS[activeTab];

    return (
        <div className="max-w-5xl space-y-8">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2.5 rounded-xl ${activeColors.icon} shadow-lg transition-all duration-500`}>
                        {(() => { const Icon = TABS.find(t => t.id === activeTab)!.icon; return <Icon className="h-5 w-5 text-white" />; })()}
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Comunicaciones</h1>
                </div>
                <p className="text-slate-500 dark:text-slate-400 ml-1">Centro unificado de comunicación de la comunidad</p>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                                isActive
                                    ? `bg-gradient-to-r ${TAB_COLORS[tab.id].active} text-white shadow-md`
                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5"
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
