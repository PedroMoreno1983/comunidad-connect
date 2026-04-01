"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { SocialService } from "@/lib/services/supabaseServices";
import { SocialPost, SocialComment } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
    Heart, MessageCircle, Share2, MoreHorizontal,
    Image as ImageIcon, Send, Smile, MapPin, Hash,
    Loader2, X as XIcon
} from "lucide-react";
import clsx from "clsx";

export default function SocialFeedPage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [posts, setPosts] = useState<SocialPost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New Post Form
    const [newPostContent, setNewPostContent] = useState("");
    const [newPostImageFile, setNewPostImageFile] = useState<File | null>(null);
    const [newPostImagePreview, setNewPostImagePreview] = useState<string | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Comments State View
    const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
    const [comments, setComments] = useState<Record<string, SocialComment[]>>({});
    const [newCommentContent, setNewCommentContent] = useState("");
    const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);

    useEffect(() => {
        loadPosts();
    }, []);

    const loadPosts = async () => {
        setIsLoading(true);
        try {
            const data = await SocialService.getPosts();
            if (data) setPosts(data as SocialPost[]);
        } catch (error) {
            console.error("Error loading social posts:", error);
            setPosts([]);
        } finally {
            setIsLoading(false);
        }
    };

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

        // Upload image to Supabase Storage if provided
        if (newPostImageFile) {
            setIsUploadingImage(true);
            try {
                const ext = newPostImageFile.name.split('.').pop();
                const path = `posts/${user.id}/${Date.now()}.${ext}`;
                const { error: uploadError } = await supabase.storage
                    .from('social-images')
                    .upload(path, newPostImageFile, { upsert: false });
                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('social-images')
                        .getPublicUrl(path);
                    imageUrl = publicUrl;
                }
            } catch (err) {
                console.error('Image upload failed:', err);
            } finally {
                setIsUploadingImage(false);
            }
        }

        try {
            const newPost = await SocialService.createPost({
                author_id: user.id,
                content: newPostContent.trim(),
                image_url: imageUrl
            });

            setPosts([newPost as SocialPost, ...posts]);
            setNewPostContent("");
            setNewPostImageFile(null);
            setNewPostImagePreview(null);

            toast({
                title: "Publicado",
                description: "Tu publicación ya está visible en el muro.",
                variant: "success"
            });
        } catch (error) {
            toast({ title: "Error", description: "Hubo un problema al publicar.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLike = async (postId: string) => {
        try {
            // Optimistic Update
            setPosts(prev => prev.map((p) => {
                if (p.id === postId) {
                    return { ...p, likes_count: (p.likes_count || 0) + 1, has_liked: true };
                }
                return p;
            }));
            await SocialService.likePost(postId);
        } catch (error) {
            // Revert on error
            setPosts(prev => prev.map((p) => {
                if (p.id === postId) {
                    return { ...p, likes_count: Math.max(0, (p.likes_count || 0) - 1), has_liked: false };
                }
                return p;
            }));
            toast({ title: "Error", description: "No se pudo dar like.", variant: "destructive" });
        }
    };

    const toggleComments = async (postId: string) => {
        if (activeCommentPostId === postId) {
            setActiveCommentPostId(null);
            return;
        }

        setActiveCommentPostId(postId);

        // Load Comments if not already loaded into dictionary
        if (!comments[postId]) {
            setLoadingCommentsPostId(postId);
            try {
                const data = await SocialService.getComments(postId);
                setComments(prev => ({ ...prev, [postId]: data }));
            } catch (error) {
                console.error("Error loading comments", error);
            } finally {
                setLoadingCommentsPostId(null);
            }
        }
    };

    const handleCreateComment = async (e: React.FormEvent, postId: string) => {
        e.preventDefault();
        if (!user || !newCommentContent.trim()) return;

        try {
            const comment = await SocialService.createComment({
                post_id: postId,
                author_id: user.id,
                content: newCommentContent.trim()
            });

            // Update comments locally
            setComments(prev => ({
                ...prev,
                [postId]: [...(prev[postId] || []), comment]
            }));

            // Increment comment count on Post summary
            setPosts(prev => prev.map((p) => p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
            setNewCommentContent("");

        } catch (error) {
            toast({ title: "Error", description: "No se pudo enviar el comentario", variant: "destructive" });
        }
    };

    return (
        <div className="max-w-3xl mx-auto py-10 px-4 sm:px-6 space-y-10">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-fuchsia-500 to-pink-600 rounded-2xl shadow-lg shadow-fuchsia-500/30">
                    <Hash className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white">Muro Social</h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">Comparte novedades, datos y fotos con tus vecinos.</p>
                </div>
            </div>

            {/* Create Post Field */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 sm:p-8 border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none transition-all hover:shadow-2xl">
                <form onSubmit={handleCreatePost}>
                    <div className="flex gap-4 sm:gap-6">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-500 flex-shrink-0 border-2 border-white dark:border-slate-800 shadow-md">
                            {user?.photo ? (
                                <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-white font-black text-lg">
                                    {user?.name.charAt(0)}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 space-y-4">
                            <textarea
                                value={newPostContent}
                                onChange={(e) => setNewPostContent(e.target.value)}
                                placeholder="¿Qué está pasando en el edificio?"
                                className="w-full min-h-[100px] resize-none bg-transparent text-lg font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                            />

                            {/* Actions Footer */}
                            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => imageInputRef.current?.click()}
                                        className="p-2 text-slate-400 hover:text-fuchsia-500 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-500/10 rounded-full transition-colors"
                                        title="Añadir Foto"
                                    >
                                        {isUploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                                    </button>
                                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                                    <button type="button" className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-full transition-colors hidden sm:block">
                                        <Smile className="h-5 w-5" />
                                    </button>
                                    <button type="button" className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-full transition-colors hidden sm:block">
                                        <MapPin className="h-5 w-5" />
                                    </button>
                                </div>
                                <Button
                                    type="submit"
                                    disabled={(!newPostContent.trim() && !newPostImageFile) || isSubmitting}
                                    className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full px-6 font-bold shadow-lg hover:scale-105 transition-transform"
                                >
                                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Publicar'}
                                </Button>
                            </div>

                            {/* Image Preview */}
                            {newPostImagePreview && (
                                <div className="relative mt-3 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                                    <img src={newPostImagePreview} alt="preview" className="w-full max-h-64 object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => { setNewPostImageFile(null); setNewPostImagePreview(null); }}
                                        className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                                    >
                                        <XIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {/* Feed Stream */}
            <div className="space-y-6">
                {isLoading && (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                )}

                {!isLoading && posts.length === 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-800 p-16 text-center space-y-4">
                        <MessageCircle className="h-16 w-16 text-slate-300 mx-auto" />
                        <h3 className="text-xl font-black text-slate-500">Nada por aquí aún</h3>
                        <p className="text-sm font-medium text-slate-400">Sé el primero en saludar a tus vecinos.</p>
                    </div>
                )}

                <AnimatePresence>
                    {posts.map((post) => (
                        <motion.div
                            key={post.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white dark:bg-slate-900 flex flex-col rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-lg shadow-slate-200/20 dark:shadow-none overflow-hidden"
                        >
                            {/* Post Header */}
                            <div className="p-6 sm:p-8 pb-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                                        {post.profiles?.avatar_url ? (
                                            <img src={post.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-black text-slate-400">
                                                {post.profiles?.name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            {post.profiles?.name || 'Residente'}
                                            {post.profiles?.unit_id && (
                                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                                    Depto {post.profiles.unit_id}
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-xs font-semibold text-slate-400 mt-0.5">
                                            {new Date(post.created_at).toLocaleDateString()} a las {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                                <button className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                                    <MoreHorizontal className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Post Body */}
                            <div className="px-6 sm:px-8 py-2">
                                <p className="text-slate-800 dark:text-slate-200 text-base leading-relaxed whitespace-pre-line">
                                    {post.content}
                                </p>
                                {post.image_url && (
                                    <div className="mt-4 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
                                        <img src={post.image_url} alt="post image" className="w-full h-auto object-cover max-h-[500px]" />
                                    </div>
                                )}
                            </div>

                            {/* Interaction Bar */}
                            <div className="px-6 sm:px-8 py-4 mt-2 border-t border-slate-50 dark:border-slate-800/50 flex items-center gap-6">
                                <button
                                    onClick={() => handleLike(post.id)}
                                    className={clsx(
                                        "flex items-center gap-2 group transition-colors",
                                        post.has_liked ? "text-rose-500" : "text-slate-400 hover:text-rose-500"
                                    )}
                                >
                                    <div className={clsx("p-2 rounded-full transition-all flex items-center justify-center", post.has_liked ? "bg-rose-50 dark:bg-rose-500/10" : "group-hover:bg-rose-50 dark:group-hover:bg-rose-500/10")}>
                                        <Heart className={clsx("h-5 w-5", post.has_liked && "fill-current")} />
                                    </div>
                                    <span className="font-bold">{post.likes_count > 0 ? post.likes_count : 'Me gusta'}</span>
                                </button>

                                <button
                                    onClick={() => toggleComments(post.id)}
                                    className="flex items-center gap-2 text-slate-400 hover:text-blue-500 group transition-colors"
                                >
                                    <div className="p-2 rounded-full transition-all flex items-center justify-center group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10">
                                        <MessageCircle className="h-5 w-5" />
                                    </div>
                                    <span className="font-bold">{post.comments_count ? post.comments_count : 'Comentar'}</span>
                                </button>

                                <button className="flex items-center gap-2 text-slate-400 hover:text-emerald-500 group transition-colors ml-auto">
                                    <div className="p-2 rounded-full transition-all flex items-center justify-center group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10">
                                        <Share2 className="h-5 w-5" />
                                    </div>
                                </button>
                            </div>

                            {/* Comments Section Dropdown */}
                            <AnimatePresence>
                                {activeCommentPostId === post.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
                                    >
                                        <div className="p-6 sm:p-8 space-y-6">
                                            {/* List of comments */}
                                            {loadingCommentsPostId === post.id ? (
                                                <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                                            ) : (
                                                <div className="space-y-5">
                                                    {(comments[post.id] || []).map((comment) => (
                                                        <div key={comment.id} className="flex gap-4">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-300 dark:bg-slate-700 flex-shrink-0">
                                                                {comment.profiles?.avatar_url ? (
                                                                    <img src={comment.profiles.avatar_url} alt="av" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-500">
                                                                        {comment.profiles?.name?.charAt(0) || '?'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 inline-block">
                                                                    <p className="text-xs font-black text-slate-900 dark:text-white mb-0.5">{comment.profiles?.name}</p>
                                                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{comment.content}</p>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-slate-400 mt-1 ml-2">
                                                                    {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(comments[post.id] || []).length === 0 && (
                                                        <p className="text-xs font-bold text-center text-slate-400">Sé el primero en comentar.</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Add Comment */}
                                            <div className="flex gap-3 pt-2">
                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-300 flex-shrink-0 hidden sm:block">
                                                    {user?.photo ? (
                                                        <img src={user.photo} alt="U" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-white bg-slate-400">
                                                            {user?.name.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <form
                                                    className="flex-1 relative"
                                                    onSubmit={(e) => handleCreateComment(e, post.id)}
                                                >
                                                    <input
                                                        type="text"
                                                        placeholder="Escribe un comentario..."
                                                        className="w-full h-10 pl-4 pr-12 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                        value={newCommentContent}
                                                        onChange={(e) => setNewCommentContent(e.target.value)}
                                                    />
                                                    <button
                                                        type="submit"
                                                        disabled={!newCommentContent.trim()}
                                                        className="absolute right-1 top-1 w-8 h-8 flex items-center justify-center bg-blue-500 text-white rounded-full disabled:opacity-50 disabled:bg-slate-300 transition-all hover:scale-105"
                                                    >
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
        </div>
    );
}
