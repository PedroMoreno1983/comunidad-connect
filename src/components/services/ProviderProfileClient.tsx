"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Star, Phone, Mail, Clock, TrendingUp, CheckCircle, Award,
    Calendar, MessageSquare, BadgeCheck, Briefcase
} from "lucide-react";
import { ServiceProvider, Review } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { getProviderAvatar } from "@/lib/utils/avatar";
import Image from "next/image";

interface ProviderProfileClientProps {
    provider: ServiceProvider;
    reviews: Review[];
}

export function ProviderProfileClient({ provider, reviews }: ProviderProfileClientProps) {
    const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [requestForm, setRequestForm] = useState({ date: '', time: '', description: '' });
    const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
    const { toast } = useToast();

    const router = useRouter();

    const handleRequestService = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await fetch('/api/service-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_id: provider.id,
                    preferred_date: requestForm.date,
                    preferred_time: requestForm.time,
                    description: requestForm.description,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    toast({
                        title: "Debes iniciar sesión",
                        description: "Por favor inicia sesión para solicitar servicios.",
                        variant: "default",
                    });
                    return;
                }
                throw new Error(data.error || 'Error al enviar solicitud');
            }

            toast({
                title: "Solicitud Enviada",
                description: `Tu solicitud ha sido enviada. Puedes ver el estado en 'Mis Solicitudes'.`,
                variant: "success",
            });
            setIsRequestDialogOpen(false);
            setRequestForm({ date: '', time: '', description: '' });
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo enviar la solicitud",
                variant: "default",
            });
        }
    };

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_id: provider.id,
                    rating: reviewForm.rating,
                    comment: reviewForm.comment,
                    service_type: provider.category,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    toast({
                        title: "Debes iniciar sesión",
                        description: "Por favor inicia sesión para dejar una reseña.",
                        variant: "default",
                    });
                    return;
                }
                throw new Error(data.error || 'Error al publicar reseña');
            }

            toast({
                title: "Reseña Publicada",
                description: "Gracias por compartir tu experiencia. Recarga la página para verla.",
                variant: "success",
            });
            setIsReviewDialogOpen(false);
            setReviewForm({ rating: 5, comment: '' });

            // Refresh the page to show new review
            router.refresh();
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo publicar la reseña",
                variant: "default",
            });
        }
    };

    const getAvailabilityConfig = (availability: string) => {
        if (availability === 'available') {
            return {
                dot: 'bg-emerald-500',
                label: 'Disponible',
                bg: 'bg-emerald-50 dark:bg-emerald-500/10',
                text: 'text-emerald-700 dark:text-emerald-400'
            };
        }
        if (availability === 'busy') {
            return {
                dot: 'bg-amber-500',
                label: 'Ocupado',
                bg: 'bg-amber-50 dark:bg-amber-500/10',
                text: 'text-amber-700 dark:text-amber-400'
            };
        }
        return {
            dot: 'bg-red-500',
            label: 'No disponible',
            bg: 'bg-red-50 dark:bg-red-500/10',
            text: 'text-red-700 dark:text-red-400'
        };
    };

    const availability = getAvailabilityConfig(provider.availability);

    return (
        <>
            {/* Header Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-700 overflow-hidden">
                {/* Cover */}
                <div className="h-32 bg-gradient-to-br from-blue-500 to-cyan-600"></div>

                {/* Profile Info */}
                <div className="px-8 pb-8">
                    {/* Avatar */}
                    <div className="flex flex-col md:flex-row gap-6 -mt-16 relative z-10">
                        {/* Foto de perfil */}
                        <div className="relative w-40 h-40 rounded-full border-4 border-white dark:border-slate-800 overflow-hidden shadow-2xl bg-slate-200 dark:bg-slate-700">
                            <Image
                                src={getProviderAvatar(provider.name, provider.photo)}
                                alt={provider.name}
                                fill
                                sizes="160px"
                                className="object-cover"
                            />
                        </div>

                        <div className="flex-grow pt-4">
                            {/* Name and verification */}
                            <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                                            {provider.name}
                                        </h1>
                                        {provider.verified && (
                                            <BadgeCheck className="h-7 w-7 text-blue-500 fill-blue-100 dark:fill-blue-500/20" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                        <div className="flex items-center gap-1">
                                            <Star className="h-5 w-5 text-amber-500 fill-current" />
                                            <span className="font-bold text-slate-900 dark:text-white">{provider.rating}</span>
                                            <span className="text-sm">({provider.reviewCount} reseñas)</span>
                                        </div>
                                        <span>•</span>
                                        <div className="flex items-center gap-1.5">
                                            <TrendingUp className="h-4 w-4" />
                                            <span>{provider.yearsExperience} años de experiencia</span>
                                        </div>
                                    </div>
                                </div>

                                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${availability.bg} ${availability.text}`}>
                                    <span className={`h-2.5 w-2.5 rounded-full ${availability.dot} animate-pulse`}></span>
                                    <span className="font-semibold">{availability.label}</span>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    onClick={() => setIsRequestDialogOpen(true)}
                                    className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                                >
                                    <Calendar className="h-4 w-4 mr-2" />
                                    Solicitar Servicio
                                </Button>
                                <a
                                    href={`tel:${provider.contactPhone}`}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                >
                                    <Phone className="h-4 w-4" />
                                    Llamar
                                </a>
                                {provider.email && (
                                    <a
                                        href={`mailto:${provider.email}`}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        <Mail className="h-4 w-4" />
                                        Email
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* About */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-6">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-blue-600" />
                            Sobre Mí
                        </h2>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {provider.bio}
                        </p>
                    </div>

                    {/* Specialties */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-6">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Award className="h-5 w-5 text-blue-600" />
                            Especialidades
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {provider.specialties.map((specialty, idx) => (
                                <span
                                    key={idx}
                                    className="px-4 py-2 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium border border-blue-100 dark:border-blue-500/20"
                                >
                                    {specialty}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Certifications */}
                    {provider.certifications.length > 0 && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-6">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-blue-600" />
                                Certificaciones
                            </h2>
                            <div className="space-y-2">
                                {provider.certifications.map((cert, idx) => (
                                    <div key={idx} className="flex items-start gap-3">
                                        <Award className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                        <span className="text-slate-700 dark:text-slate-300">{cert}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reviews */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-blue-600" />
                                Reseñas ({reviews.length})
                            </h2>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsReviewDialogOpen(true)}
                            >
                                Dejar Reseña
                            </Button>
                        </div>

                        <div className="space-y-4">
                            {reviews.length > 0 ? (
                                reviews.map((review) => (
                                    <div key={review.id} className="border-b border-slate-100 dark:border-slate-700 last:border-0 pb-4 last:pb-0">
                                        <div className="flex items-start gap-3 mb-2">
                                            {review.userAvatar ? (
                                                <div className="relative w-10 h-10 rounded-full overflow-hidden">
                                                    <Image
                                                        src={review.userAvatar}
                                                        alt={review.userName}
                                                        fill
                                                        sizes="40px"
                                                        className="object-cover"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400 font-semibold">
                                                    {review.userName.charAt(0)}
                                                </div>
                                            )}
                                            <div className="flex-grow">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className="font-semibold text-slate-900 dark:text-white">{review.userName}</h4>
                                                    <div className="flex items-center gap-1">
                                                        {Array.from({ length: 5 }).map((_, i) => (
                                                            <Star
                                                                key={i}
                                                                className={`h-4 w-4 ${i < review.rating ? 'text-amber-500 fill-current' : 'text-slate-300 dark:text-slate-600'}`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                                                    {review.serviceType} • {new Date(review.createdAt).toLocaleDateString('es-CL')}
                                                </p>
                                                <p className="text-slate-700 dark:text-slate-300">{review.comment}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                                    Aún no hay reseñas para este proveedor
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Contact Info */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-6">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-4">Información de Contacto</h3>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                                <Phone className="h-5 w-5 text-slate-400" />
                                <a href={`tel:${provider.contactPhone}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                                    {provider.contactPhone}
                                </a>
                            </div>
                            {provider.email && (
                                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                                    <Mail className="h-5 w-5 text-slate-400" />
                                    <a href={`mailto:${provider.email}`} className="hover:text-blue-600 dark:hover:text-blue-400 break-all">
                                        {provider.email}
                                    </a>
                                </div>
                            )}
                            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                                <Clock className="h-5 w-5 text-slate-400" />
                                <span>Responde en {provider.responseTime}</span>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-6">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-4">Estadísticas</h3>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Trabajos Completados</span>
                                    <span className="font-bold text-slate-900 dark:text-white">{provider.completedJobs}</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Calificación</span>
                                    <span className="font-bold text-slate-900 dark:text-white">{provider.rating}/5.0</span>
                                </div>
                            </div>
                            {provider.hourlyRate && (
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-slate-600 dark:text-slate-400">Tarifa por Hora</span>
                                        <span className="font-bold text-slate-900 dark:text-white">${provider.hourlyRate.toLocaleString('es-CL')}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Verification Badge */}
                    {provider.verified && (
                        <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl shadow-lg p-6 text-white">
                            <div className="flex items-center gap-3 mb-2">
                                <BadgeCheck className="h-6 w-6" />
                                <h3 className="font-bold">Técnico Verificado</h3>
                            </div>
                            <p className="text-sm text-white/90">
                                Este profesional ha sido verificado y cuenta con las certificaciones necesarias para realizar su trabajo.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Request Service Dialog */}
            <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Solicitar Servicio a {provider.name}</DialogTitle>
                        <DialogDescription>
                            Completa los detalles para coordinar el servicio.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRequestService} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha Preferida</label>
                            <Input
                                type="date"
                                required
                                value={requestForm.date}
                                onChange={(e) => setRequestForm({ ...requestForm, date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Hora Preferida</label>
                            <Input
                                type="time"
                                required
                                value={requestForm.time}
                                onChange={(e) => setRequestForm({ ...requestForm, time: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Descripción del Servicio</label>
                            <textarea
                                className="w-full min-h-[100px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="Describe el servicio que necesitas..."
                                required
                                value={requestForm.description}
                                onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="submit">Enviar Solicitud</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Review Dialog */}
            <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Dejar una Reseña</DialogTitle>
                        <DialogDescription>
                            Comparte tu experiencia con {provider.name}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmitReview} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Calificación</label>
                            <div className="flex gap-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setReviewForm({ ...reviewForm, rating: i + 1 })}
                                        className="focus:outline-none"
                                    >
                                        <Star
                                            className={`h-8 w-8 ${i < reviewForm.rating ? 'text-amber-500 fill-current' : 'text-slate-300 dark:text-slate-600'} hover:text-amber-400 transition-colors`}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tu Comentario</label>
                            <textarea
                                className="w-full min-h-[120px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="Cuéntanos sobre tu experiencia..."
                                required
                                value={reviewForm.comment}
                                onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="submit">Publicar Reseña</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
