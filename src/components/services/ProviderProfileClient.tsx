"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    BadgeCheck,
    Briefcase,
    Calendar,
    CheckCircle,
    Clock,
    Mail,
    MessageCircle,
    Phone,
    ShieldCheck,
    Star,
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
import { getInitials } from "@/lib/utils/avatar";
import { getCategoryVisual } from "@/components/services/categoryVisuals";

interface ProviderProfileClientProps {
    provider: ServiceProvider;
    reviews: Review[];
}

function getAvailabilityConfig(availability: string) {
    if (availability === "available") {
        return { dot: "bg-emerald-500", label: "Disponible hoy", text: "#047857" };
    }
    if (availability === "busy") {
        return { dot: "bg-amber-500", label: "Agenda ocupada", text: "#B45309" };
    }
    return { dot: "bg-red-500", label: "Sin cupos", text: "#B5524E" };
}

function whatsappUrl(phone: string) {
    return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

function ratingBreakdown(reviews: Review[]) {
    const counts = [0, 0, 0, 0, 0];
    for (const review of reviews) {
        const star = Math.min(5, Math.max(1, Math.round(review.rating)));
        counts[star - 1] += 1;
    }
    return [5, 4, 3, 2, 1].map(star => ({
        star,
        count: counts[star - 1],
        pct: reviews.length > 0 ? Math.round((counts[star - 1] / reviews.length) * 100) : 0,
    }));
}

export function ProviderProfileClient({ provider, reviews }: ProviderProfileClientProps) {
    const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [isRequestSaving, setIsRequestSaving] = useState(false);
    const [isReviewSaving, setIsReviewSaving] = useState(false);
    const [requestForm, setRequestForm] = useState({ date: "", time: "", description: "" });
    const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
    const { toast } = useToast();
    const router = useRouter();
    const availability = getAvailabilityConfig(provider.availability);
    const visual = getCategoryVisual(provider.category);
    const hasReviews = provider.reviewCount > 0;
    const breakdown = ratingBreakdown(reviews);

    const handleRequestService = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isRequestSaving) return;

        try {
            setIsRequestSaving(true);

            const response = await fetch("/api/service-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
                        title: "Debes iniciar sesion",
                        description: "Por favor inicia sesion para solicitar servicios.",
                        variant: "default",
                    });
                    return;
                }
                throw new Error(data.error || "Error al enviar solicitud");
            }

            toast({
                title: "Solicitud enviada",
                description: "Tu solicitud fue enviada. Puedes ver el estado en Mis solicitudes.",
                variant: "success",
            });
            setIsRequestDialogOpen(false);
            setRequestForm({ date: "", time: "", description: "" });
            router.push("/services/my-requests");
        } catch (error: unknown) {
            console.error("[ProviderProfile] request service failed:", error);
            toast({
                title: "No pudimos enviar la solicitud",
                description: "Revisa los datos e intenta nuevamente. Si el problema continua, contacta a administracion.",
                variant: "destructive",
            });
        } finally {
            setIsRequestSaving(false);
        }
    };

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isReviewSaving) return;

        try {
            setIsReviewSaving(true);

            const response = await fetch("/api/reviews", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
                        title: "Debes iniciar sesion",
                        description: "Por favor inicia sesion para dejar una resena.",
                        variant: "default",
                    });
                    return;
                }
                throw new Error(data.error || "Error al publicar resena");
            }

            toast({
                title: "Resena publicada",
                description: "Gracias por compartir tu experiencia. Recarga la pagina para verla.",
                variant: "success",
            });
            setIsReviewDialogOpen(false);
            setReviewForm({ rating: 5, comment: "" });
            router.refresh();
        } catch (error: unknown) {
            console.error("[ProviderProfile] submit review failed:", error);
            toast({
                title: "No pudimos publicar la resena",
                description: "Intenta nuevamente en unos segundos.",
                variant: "destructive",
            });
        } finally {
            setIsReviewSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
            {/* Columna de reserva estilo Preply */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
                <section className="overflow-hidden rounded-3xl border shadow-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    {/* "Foto" del proveedor */}
                    <div className="relative aspect-[4/3] w-full" style={{ background: visual.gradient }}>
                        <visual.Icon className="absolute -bottom-8 right-2 h-40 w-40 text-white" style={{ opacity: 0.12 }} strokeWidth={1} />
                        <span
                            className="absolute inset-0 grid place-items-center text-7xl text-white"
                            style={{ fontFamily: "var(--cc-font-display)" }}
                        >
                            {getInitials(provider.name)}
                        </span>
                        <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold shadow-sm" style={{ color: availability.text }}>
                            <span className={`h-2 w-2 rounded-full ${availability.dot}`} />
                            {availability.label}
                        </span>
                    </div>

                    <div className="p-5">
                        <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm cc-text-tertiary">Tarifa</p>
                            <p className="text-2xl font-bold cc-text-primary">
                                {provider.hourlyRate ? `$${provider.hourlyRate.toLocaleString("es-CL")}` : "A convenir"}
                                {provider.hourlyRate ? <span className="text-sm font-normal cc-text-tertiary"> /hora</span> : null}
                            </p>
                        </div>

                        <Button
                            onClick={() => setIsRequestDialogOpen(true)}
                            className="mt-4 h-12 w-full rounded-full text-[15px] font-semibold hover:opacity-90"
                            style={{ backgroundColor: "var(--cc-ink)" }}
                        >
                            <Calendar className="mr-2 h-4 w-4" />
                            Solicitar servicio
                        </Button>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            <a
                                href={`tel:${provider.contactPhone}`}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-semibold cc-text-primary transition hover:bg-[var(--cc-paper-warm)]"
                                style={{ borderColor: "var(--cc-line-strong)" }}
                            >
                                <Phone className="h-4 w-4" />
                                Llamar
                            </a>
                            <a
                                href={whatsappUrl(provider.contactPhone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition hover:bg-[rgba(5,150,105,0.08)]"
                                style={{ borderColor: "#059669", color: "#047857" }}
                            >
                                <MessageCircle className="h-4 w-4" />
                                WhatsApp
                            </a>
                        </div>

                        <div className="mt-5 space-y-3 border-t pt-4 text-sm" style={{ borderColor: "var(--cc-line)" }}>
                            <p className="flex items-center gap-3 cc-text-secondary">
                                <Clock className="h-4 w-4 shrink-0" style={{ color: visual.accent }} />
                                Suele responder en {provider.responseTime}
                            </p>
                            <a href={`tel:${provider.contactPhone}`} className="flex items-center gap-3 cc-text-secondary transition hover:cc-text-primary">
                                <Phone className="h-4 w-4 shrink-0" style={{ color: visual.accent }} />
                                {provider.contactPhone}
                            </a>
                            {provider.email && (
                                <a href={`mailto:${provider.email}`} className="flex items-center gap-3 break-all cc-text-secondary transition hover:cc-text-primary">
                                    <Mail className="h-4 w-4 shrink-0" style={{ color: visual.accent }} />
                                    {provider.email}
                                </a>
                            )}
                            {provider.verified && (
                                <p className="flex items-center gap-3 cc-text-secondary">
                                    <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} />
                                    Identidad y datos verificados por la comunidad
                                </p>
                            )}
                        </div>
                    </div>
                </section>
            </aside>

            {/* Contenido principal */}
            <main className="min-w-0 space-y-8">
                <header>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="text-3xl font-bold leading-tight tracking-tight cc-text-primary sm:text-4xl">
                            {provider.name}
                        </h1>
                        {provider.verified && <BadgeCheck className="h-6 w-6" style={{ color: "var(--cc-sage)" }} />}
                    </div>
                    <p className="mt-2 text-base cc-text-secondary">
                        {visual.label} · Comunidades residenciales
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm cc-text-secondary">
                        {hasReviews ? (
                            <span className="inline-flex items-center gap-1.5">
                                <Star className="h-4 w-4" style={{ color: "var(--cc-amber)", fill: "var(--cc-amber)" }} />
                                <strong className="cc-text-primary">{provider.rating}</strong>
                                <span className="cc-text-tertiary">{provider.reviewCount} reseña{provider.reviewCount === 1 ? "" : "s"}</span>
                            </span>
                        ) : (
                            <span
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                                style={{ background: visual.soft, color: visual.accent }}
                            >
                                <Star className="h-3.5 w-3.5" />
                                Nuevo en la red
                            </span>
                        )}
                        {provider.completedJobs > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                                <Briefcase className="h-4 w-4 cc-text-tertiary" />
                                {provider.completedJobs} trabajos realizados
                            </span>
                        )}
                    </div>
                </header>

                {/* Barra de datos estilo Preply */}
                <section
                    className="grid grid-cols-2 divide-x rounded-2xl border py-5 sm:grid-cols-4"
                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)", ["--tw-divide-opacity" as string]: "1" }}
                >
                    {[
                        { value: provider.completedJobs > 0 ? String(provider.completedJobs) : "Nuevo", label: "Trabajos" },
                        { value: provider.yearsExperience > 0 ? `${provider.yearsExperience}` : "—", label: "Años de experiencia" },
                        { value: provider.responseTime, label: "Tiempo de respuesta" },
                        { value: provider.hourlyRate ? `$${provider.hourlyRate.toLocaleString("es-CL")}` : "Cotiza", label: "Tarifa por hora" },
                    ].map(stat => (
                        <div key={stat.label} className="px-4 text-center" style={{ borderColor: "var(--cc-line)" }}>
                            <p className="truncate text-xl font-bold cc-text-primary">{stat.value}</p>
                            <p className="mt-1 text-xs cc-text-tertiary">{stat.label}</p>
                        </div>
                    ))}
                </section>

                <section>
                    <h2 className="text-xl font-bold cc-text-primary">Acerca de {provider.name.split(" ")[0]}</h2>
                    {provider.bio ? (
                        <p className="mt-3 text-[15px] leading-7 cc-text-secondary">{provider.bio}</p>
                    ) : (
                        <p className="mt-3 text-[15px] leading-7 cc-text-tertiary">
                            Este proveedor aún no agregó una descripción. Solicita una cotización para conocer más sobre su trabajo.
                        </p>
                    )}
                </section>

                {provider.specialties.length > 0 && (
                    <section>
                        <h2 className="text-xl font-bold cc-text-primary">Especialidades</h2>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {provider.specialties.map((specialty) => (
                                <span
                                    key={specialty}
                                    className="rounded-full border px-4 py-1.5 text-sm font-medium cc-text-secondary"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                >
                                    {specialty}
                                </span>
                            ))}
                        </div>
                    </section>
                )}

                {provider.certifications.length > 0 && (
                    <section>
                        <h2 className="text-xl font-bold cc-text-primary">Credenciales</h2>
                        <div className="mt-3 space-y-3">
                            {provider.certifications.map((cert) => (
                                <div key={cert} className="flex items-start gap-3">
                                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>
                                        <CheckCircle className="h-5 w-5" />
                                    </span>
                                    <span className="pt-2 text-sm font-semibold cc-text-secondary">{cert}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section>
                    <h2 className="text-xl font-bold cc-text-primary">Reseñas</h2>

                    {reviews.length > 0 && (
                        <div className="mt-4 flex flex-col gap-6 rounded-2xl border p-6 sm:flex-row sm:items-center" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="text-center sm:w-36">
                                <p className="text-5xl font-bold cc-text-primary">{provider.rating}</p>
                                <div className="mt-2 flex justify-center gap-0.5">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Star
                                            key={i}
                                            className={`h-4 w-4 ${i < Math.round(provider.rating) ? "fill-amber-500 text-amber-500" : "cc-text-tertiary"}`}
                                        />
                                    ))}
                                </div>
                                <p className="mt-2 text-xs cc-text-tertiary">{reviews.length} reseña{reviews.length === 1 ? "" : "s"}</p>
                            </div>
                            <div className="flex-1 space-y-2">
                                {breakdown.map(row => (
                                    <div key={row.star} className="flex items-center gap-3 text-xs cc-text-secondary">
                                        <span className="w-3 text-right font-semibold">{row.star}</span>
                                        <Star className="h-3 w-3" style={{ color: "var(--cc-amber)", fill: "var(--cc-amber)" }} />
                                        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--cc-paper-warm)" }}>
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${row.pct}%`, background: "var(--cc-amber)" }}
                                            />
                                        </div>
                                        <span className="w-8 cc-text-tertiary">{row.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Composer */}
                    <button
                        type="button"
                        onClick={() => setIsReviewDialogOpen(true)}
                        className="mt-5 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:bg-[var(--cc-paper-warm)]"
                        style={{ borderColor: "var(--cc-line)" }}
                    >
                        <span
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
                            style={{ background: visual.soft, color: visual.accent, fontFamily: "var(--cc-font-display)" }}
                        >
                            Tú
                        </span>
                        <span className="text-sm cc-text-tertiary">¿Trabajó contigo? Comparte tu experiencia…</span>
                    </button>

                    <div className="mt-6 space-y-6">
                        {reviews.length > 0 ? (
                            reviews.map((review) => (
                                <article key={review.id} className="flex items-start gap-3.5">
                                    {review.userAvatar ? (
                                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full">
                                            <img src={review.userAvatar} alt={review.userName} className="h-full w-full object-cover" />
                                        </div>
                                    ) : (
                                        <div
                                            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                                            style={{ background: visual.gradient, fontFamily: "var(--cc-font-display)" }}
                                        >
                                            {review.userName.charAt(0)}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-sm font-bold cc-text-primary">{review.userName}</h3>
                                            <div className="flex items-center gap-0.5">
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                    <Star
                                                        key={i}
                                                        className={`h-3.5 w-3.5 ${i < review.rating ? "fill-amber-500 text-amber-500" : "cc-text-tertiary"}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <p className="mt-0.5 text-xs cc-text-tertiary">
                                            {new Date(review.createdAt).toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" })}
                                        </p>
                                        <p className="mt-2 text-sm leading-6 cc-text-secondary">{review.comment}</p>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <p className="rounded-2xl border border-dashed p-8 text-center text-sm cc-text-tertiary" style={{ borderColor: "var(--cc-line-strong)" }}>
                                Aún no hay reseñas. Sé el primero en compartir tu experiencia con {provider.name.split(" ")[0]}.
                            </p>
                        )}
                    </div>
                </section>
            </main>

            {/* Barra móvil fija */}
            <div className="fixed bottom-4 left-4 right-20 z-30 flex gap-2 rounded-full border p-2 shadow-lg lg:hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <Button onClick={() => setIsRequestDialogOpen(true)} className="h-12 flex-1 rounded-full hover:opacity-90" style={{ backgroundColor: "var(--cc-ink)" }}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Solicitar servicio
                </Button>
                <a
                    href={`tel:${provider.contactPhone}`}
                    aria-label={`Llamar a ${provider.name}`}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full border cc-text-primary"
                    style={{ borderColor: "var(--cc-line-strong)" }}
                >
                    <Phone className="h-4 w-4" />
                </a>
            </div>

            <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Solicitar servicio a {provider.name}</DialogTitle>
                        <DialogDescription>
                            Completa los detalles para coordinar el servicio.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRequestService} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary">Fecha preferida</label>
                            <Input
                                type="date"
                                required
                                value={requestForm.date}
                                onChange={(e) => setRequestForm({ ...requestForm, date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary">Hora preferida</label>
                            <Input
                                type="time"
                                required
                                value={requestForm.time}
                                onChange={(e) => setRequestForm({ ...requestForm, time: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary">Descripcion del servicio</label>
                            <textarea
                                className="min-h-[100px] w-full rounded-xl border border-default bg-surface px-3 py-2 text-sm cc-text-primary focus:outline-none focus:border-[var(--cc-copper)] focus:ring-4 focus:ring-[var(--cc-copper)]/15"
                                placeholder="Describe el servicio que necesitas..."
                                required
                                value={requestForm.description}
                                onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isRequestSaving}>
                                {isRequestSaving ? "Enviando..." : "Enviar solicitud"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Dejar una resena</DialogTitle>
                        <DialogDescription>
                            Comparte tu experiencia con {provider.name}.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmitReview} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary">Calificacion</label>
                            <div className="flex gap-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setReviewForm({ ...reviewForm, rating: i + 1 })}
                                        className="focus:outline-none"
                                    >
                                        <Star
                                            className={`h-8 w-8 ${i < reviewForm.rating ? "fill-amber-500 text-amber-500" : "cc-text-tertiary"} transition-colors hover:text-amber-400`}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary">Tu comentario</label>
                            <textarea
                                className="min-h-[120px] w-full rounded-xl border border-default bg-surface px-3 py-2 text-sm cc-text-primary focus:outline-none focus:border-[var(--cc-copper)] focus:ring-4 focus:ring-[var(--cc-copper)]/15"
                                placeholder="Cuéntanos sobre tu experiencia..."
                                required
                                value={reviewForm.comment}
                                onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isReviewSaving}>
                                {isReviewSaving ? "Publicando..." : "Publicar resena"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
