"use client";
/* eslint-disable @next/next/no-img-element -- Social feed renders user-uploaded Supabase assets and local image previews. */

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { SocialService } from "@/lib/services/supabaseServices";
import { SocialPost, SocialComment } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
    Heart, MessageCircle, MoreHorizontal,
    Image as ImageIcon, Send, Smile, MapPin,
    Loader2, X as XIcon, ArrowRight
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


        if (newPostImageFile) {
            setIsUploadingImage(true);
            try {
                imageUrl = await SocialService.uploadPostImage(user.id, newPostImageFile);
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
            console.error("Post creation error:", error);
            toast({ title: "Error", description: "Hubo un problema al publicar.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLike = async (postId: string) => {

        try {
            setPosts(prev => prev.map((p) => {
                if (p.id === postId) {
                    return { ...p, likes_count: (p.likes_count || 0) + 1, has_liked: true };
                }
                return p;
            }));
            await SocialService.likePost(postId);
        } catch {
            setPosts(prev => prev.map((p) => {
                if (p.id === postId) {
                    return { ...p, likes_count: Math.max(0, (p.likes_count || 0) - 1), has_liked: false };
                }
                return p;
            }));
            toast({ title: "Error", description: "No se pudo registrar tu reacción.", variant: "destructive" });
        }
    };

    const toggleComments = async (postId: string) => {
        if (activeCommentPostId === postId) {
            setActiveCommentPostId(null);
            return;
        }

        setActiveCommentPostId(postId);

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

            setComments(prev => ({
                ...prev,
                [postId]: [...(prev[postId] || []), comment]
            }));

            setPosts(prev => prev.map((p) => p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
            setNewCommentContent("");

        } catch (error) {
            console.error("Error commenting:", error);
            toast({ title: "Error", description: "No se pudo enviar el comentario", variant: "destructive" });
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
            {/* Header */}
            <div className="border-b border-subtle pb-6">
                <Eyebrow>Comunidad</Eyebrow>
                <DisplayHeading size={36} className="mt-2">
                    Plaza <em className="text-italic-serif text-brand-600">social</em>
                </DisplayHeading>
                <p className="mt-2 text-sm cc-text-secondary">
                    Comparte novedades, datos, fotos y conversa informalmente con tus vecinos de copropiedad.
                </p>
            </div>


            {/* Create Post Field */}
            <div className="bg-surface rounded-xl p-6 border border-subtle shadow-sm transition-all hover:border-brand-200">
                <form onSubmit={handleCreatePost}>
                    <div className="flex gap-4">
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-900 text-white flex-shrink-0 flex items-center justify-center font-bold text-base border border-subtle">
                            {user?.photo ? (
                                <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                user?.name?.charAt(0).toUpperCase() || 'U'
                            )}
                        </div>
                        <div className="flex-1 space-y-4">
                            <textarea
                                value={newPostContent}
                                onChange={(e) => setNewPostContent(e.target.value)}
                                placeholder="Comparte algo útil con tus vecinos..."
                                className="w-full min-h-[90px] resize-none bg-transparent text-sm font-medium cc-text-primary placeholder:text-slate-400 focus:outline-none"
                            />

                            {/* Actions Footer */}
                            <div className="flex items-center justify-between pt-4 border-t border-subtle">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => imageInputRef.current?.click()}
                                        className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                                        title="Añadir Foto"
                                    >
                                        {isUploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                                    </button>
                                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                                    <button type="button" className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors hidden sm:block">
                                        <Smile className="h-5 w-5" />
                                    </button>
                                    <button type="button" className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors hidden sm:block">
                                        <MapPin className="h-5 w-5" />
                                    </button>
                                </div>
                                <Button
                                    type="submit"
                                    disabled={(!newPostContent.trim() && !newPostImageFile) || isSubmitting}
                                    variant="copper"
                                    size="sm"
                                >
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publicar'}
                                </Button>
                            </div>

                            {/* Image Preview */}
                            {newPostImagePreview && (
                                <div className="relative mt-3 rounded-xl overflow-hidden border border-subtle">
                                    <img src={newPostImagePreview} alt="preview" className="w-full max-h-64 object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => { setNewPostImageFile(null); setNewPostImagePreview(null); }}
                                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black transition-colors"
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
                    <div className="space-y-4">
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                )}

                {!isLoading && posts.length === 0 && (
                    <div className="bg-canvas/50 rounded-xl border border-dashed border-subtle p-16 text-center space-y-4">
                        <MessageCircle className="h-16 w-16 text-slate-300 mx-auto" />
                        <h3 className="text-lg font-bold cc-text-primary">Muro vacío</h3>
                        <p className="text-xs cc-text-secondary">Sé el primero en saludar a tus vecinos.</p>
                    </div>
                )}

                <AnimatePresence>
                    {posts.map((post) => (
                        <motion.div
                            key={post.id}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-surface flex flex-col rounded-xl border border-subtle shadow-sm overflow-hidden"
                        >
                            {/* Post Header */}
                            <div className="p-6 pb-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center font-bold text-white text-sm border border-subtle flex-shrink-0">
                                        {post.profiles?.avatar_url ? (
                                            <img src={post.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            post.profiles?.name?.charAt(0).toUpperCase() || '?'
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold cc-text-primary flex items-center gap-2 text-sm leading-snug">
                                            {post.profiles?.name || 'Residente'}
                                            {post.profiles?.unit_id && (
                                                <Tag tone="neutral">Depto {post.profiles.unit_id}</Tag>
                                            )}
                                        </h3>
                                        <p className="text-[10px] cc-text-tertiary mt-0.5 font-medium">
                                            {new Date(post.created_at).toLocaleDateString()} a las {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                                <button className="p-2 text-slate-400 hover:bg-elevated rounded-lg transition-colors">
                                    <MoreHorizontal className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Post Body */}
                            <div className="px-6 py-2">
                                <p className="cc-text-primary text-sm leading-relaxed whitespace-pre-line">
                                    {post.content}
                                </p>
                                
                                {/* Dynamic image preview or striped image placeholder */}
                                {post.image_url ? (
                                    <div className="mt-4 rounded-xl overflow-hidden border border-subtle">
                                        <img src={post.image_url} alt="post media" className="w-full h-auto object-cover max-h-[400px]" />
                                    </div>
                                ) : (
                                    /* Handoff spec: "image striped placeholder" when no image is loaded to give visual texture */
                                    <div className="mt-3 h-1.5 w-full bg-radial-gradient rounded-full opacity-40" 
                                         style={{ 
                                             backgroundImage: `repeating-linear-gradient(45deg, var(--cc-line) 0px, var(--cc-line) 2px, transparent 2px, transparent 10px)`
                                         }} 
                                    />
                                )}
                            </div>

                            {/* Interaction Bar */}
                            <div className="px-6 py-4 mt-2 border-t border-subtle/50 flex items-center justify-between">
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => handleLike(post.id)}
                                        className={clsx(
                                            "flex items-center gap-2 group transition-colors text-xs font-semibold",
                                            post.has_liked ? "text-rose-500" : "cc-text-secondary hover:text-rose-500"
                                        )}
                                    >
                                        <Heart className={clsx("h-4.5 w-4.5", post.has_liked && "fill-current")} />
                                        <span>{post.likes_count > 0 ? post.likes_count : 'Me gusta'}</span>
                                    </button>

                                    <button
                                        onClick={() => toggleComments(post.id)}
                                        className="flex items-center gap-2 cc-text-secondary hover:text-brand-600 group transition-colors text-xs font-semibold"
                                    >
                                        <MessageCircle className="h-4.5 w-4.5" />
                                        <span>{post.comments_count ? post.comments_count : 'Comentar'}</span>
                                    </button>
                                </div>

                                <button 
                                    onClick={() => toggleComments(post.id)}
                                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 hover:underline"
                                >
                                    Ver conversación <ArrowRight className="h-3 w-3" />
                                </button>
                            </div>

                            {/* Comments Section Dropdown */}
                            <AnimatePresence>
                                {activeCommentPostId === post.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="bg-elevated/30 border-t border-subtle overflow-hidden"
                                    >
                                        <div className="p-6 space-y-5">
                                            {/* List of comments */}
                                            {loadingCommentsPostId === post.id ? (
                                                <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {(comments[post.id] || []).map((comment) => (
                                                        <div key={comment.id} className="flex gap-3">
                                                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-elevated flex-shrink-0 flex items-center justify-center font-bold text-xs border border-subtle">
                                                                {comment.profiles?.avatar_url ? (
                                                                    <img src={comment.profiles.avatar_url} alt="av" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    comment.profiles?.name?.charAt(0).toUpperCase() || '?'
                                                                )}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="bg-surface px-4 py-2.5 rounded-xl rounded-tl-none border border-subtle inline-block">
                                                                    <p className="text-[11px] font-bold cc-text-primary mb-0.5">{comment.profiles?.name}</p>
                                                                    <p className="text-xs font-medium cc-text-secondary leading-relaxed">{comment.content}</p>
                                                                </div>
                                                                <p className="text-[9px] font-bold text-slate-400 mt-1 ml-2">
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
                                                <form
                                                    className="flex-1 relative"
                                                    onSubmit={(e) => handleCreateComment(e, post.id)}
                                                >
                                                    <input
                                                        type="text"
                                                        placeholder="Escribe un comentario..."
                                                        className="w-full h-10 pl-4 pr-12 rounded-xl border border-subtle bg-surface text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-800"
                                                        value={newCommentContent}
                                                        onChange={(e) => setNewCommentContent(e.target.value)}
                                                    />
                                                    <button
                                                        type="submit"
                                                        disabled={!newCommentContent.trim()}
                                                        className="absolute right-1 top-1 w-8 h-8 flex items-center justify-center bg-brand-500 text-white rounded-lg disabled:opacity-50 disabled:bg-slate-300 transition-all"
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
