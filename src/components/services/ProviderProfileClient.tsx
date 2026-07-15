"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Award,
    BadgeCheck,
    Briefcase,
    Calendar,
    CheckCircle,
    Clock,
    Mail,
    MessageSquare,
    Phone,
    Send,
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

interface ProviderProfileClientProps {
    provider: ServiceProvider;
    reviews: Review[];
}


const CATEGORY_LABELS: Record<string, string> = {
    plumbing: "Gasfiteria",
    electrical: "Electricidad",
    locksmith: "Cerrajeria",
    cleaning: "Limpieza",
    general: "Multiservicios",
};


function getAvailabilityConfig(availability: string) {
    if (availability === "available") {
        return {
            dot: "bg-emerald-500",
            label: "Disponible hoy",
            bg: "bg-success-bg",
            text: "text-success-fg",
        };
    }
    if (availability === "busy") {
        return {
            dot: "bg-amber-500",
            label: "Agenda ocupada",
            bg: "bg-warning-bg",
            text: "text-warning-fg",
        };
    }
    return {
        dot: "bg-red-500",
        label: "Sin cupos",
        bg: "bg-danger-bg",
        text: "text-danger-fg",
    };
}

function ProviderProfileAvatar({ provider }: { provider: ServiceProvider }) {
    const initials = getInitials(provider.name);

    return (
        <div
            className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl sm:h-28 sm:w-28"
            style={{ background: "var(--cc-ink)", color: "var(--cc-copper-soft)", fontFamily: "var(--cc-font-display)", fontSize: 36 }}
        >
            {initials}
        </div>
    );
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
    const categoryLabel = CATEGORY_LABELS[provider.category] || provider.category;

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
        <>
            <section className="rounded-[20px] border p-6 sm:p-7" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <p className="mb-3 text-[10px] uppercase tracking-[0.16em] cc-text-tertiary">Red de proveedores de tu comunidad</p>
                <span
                    className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
                    style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}
                >
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Perfil profesional verificado
                </span>

                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                        <ProviderProfileAvatar provider={provider} />
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-display text-3xl leading-none tracking-tight cc-text-primary md:text-4xl" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    {provider.name}
                                </h1>
                                {provider.verified && <BadgeCheck className="h-5 w-5" style={{ color: "var(--cc-sage)" }} />}
                            </div>
                            <p className="mt-2 text-sm cc-text-secondary">
                                {categoryLabel} para comunidades residenciales
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm cc-text-secondary">
                                <span className="inline-flex items-center gap-1.5">
                                    <Star className="h-4 w-4" style={{ color: "var(--cc-amber)", fill: "var(--cc-amber)" }} />
                                    <strong className="font-mono cc-text-primary">{provider.rating}</strong>
                                    ({provider.reviewCount} reseñas)
                                </span>
                                <span style={{ color: "var(--cc-line-strong)" }}>·</span>
                                <span>{provider.yearsExperience} años de experiencia</span>
                            </div>
                        </div>
                    </div>

                    <div className="hidden flex-wrap gap-2.5 lg:flex">
                        <Button onClick={() => setIsRequestDialogOpen(true)} className="hover:opacity-90" style={{ backgroundColor: "var(--cc-ink)" }}>
                            <Calendar className="mr-2 h-4 w-4" />
                            Solicitar servicio
                        </Button>
                        <a
                            href={`tel:${provider.contactPhone}`}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium cc-text-primary transition hover:bg-[var(--cc-paper-warm)]"
                            style={{ borderColor: "var(--cc-line-strong)" }}
                        >
                            <Phone className="h-4 w-4" />
                            Llamar
                        </a>
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-x-7 gap-y-3 border-t pt-5" style={{ borderColor: "var(--cc-line)" }}>
                    {[
                        { label: "Trabajos", value: provider.completedJobs },
                        { label: "Respuesta", value: provider.responseTime },
                        { label: "Tarifa", value: provider.hourlyRate ? `$${provider.hourlyRate.toLocaleString("es-CL")}/h` : "Cotiza" },
                        { label: "Estado", value: availability.label },
                    ].map(stat => (
                        <div key={stat.label} className="flex items-baseline gap-1.5">
                            <p className="text-xl leading-none cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{stat.value}</p>
                            <p className="text-[11px] cc-text-tertiary">{stat.label.toLowerCase()}</p>
                        </div>
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
                <main className="space-y-6">
                    <section className="rounded-[18px] border border-default bg-surface p-6">
                        <div className="mb-4 flex items-center gap-2">
                            <Briefcase className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                            <h2 className="text-xl font-normal tracking-normal cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Acerca del proveedor</h2>
                        </div>
                        <p className="text-sm leading-7 cc-text-secondary">{provider.bio}</p>
                    </section>

                    <section className="rounded-[18px] border border-default bg-surface p-6">
                        <div className="mb-4 flex items-center gap-2">
                            <Award className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                            <h2 className="text-xl font-normal tracking-normal cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Habilidades principales</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {provider.specialties.map((specialty) => (
                                <span
                                    key={specialty}
                                    className="rounded-full px-4 py-2 text-sm font-medium"
                                    style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper-deep)" }}
                                >
                                    {specialty}
                                </span>
                            ))}
                        </div>
                    </section>

                    {provider.certifications.length > 0 && (
                        <section className="rounded-[18px] border border-default bg-surface p-6">
                            <div className="mb-4 flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                                <h2 className="text-xl font-normal tracking-normal cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Credenciales</h2>
                            </div>
                            <div className="space-y-3">
                                {provider.certifications.map((cert) => (
                                    <div key={cert} className="flex items-start gap-3 rounded-xl border border-default bg-elevated p-4">
                                        <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-success-fg" />
                                        <span className="text-sm font-semibold cc-text-secondary">{cert}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="rounded-[18px] border border-default bg-surface p-6">
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                                <h2 className="text-xl font-normal tracking-normal cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Reseñas ({reviews.length})</h2>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setIsReviewDialogOpen(true)}>
                                Dejar resena
                            </Button>
                        </div>

                        <div className="space-y-4">
                            {reviews.length > 0 ? (
                                reviews.map((review) => (
                                    <article key={review.id} className="rounded-xl border border-default bg-elevated p-4">
                                        <div className="flex items-start gap-3">
                                            {review.userAvatar ? (
                                                <div className="relative h-11 w-11 overflow-hidden rounded-full">
                                                    <img
                                                        src={review.userAvatar}
                                                        alt={review.userName}
                                                        className="h-full w-full object-cover"
                                                    />
                                                </div>
                                            ) : (
                                                <div
                                                    className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
                                                    style={{ background: "var(--cc-ink)", color: "var(--cc-copper-soft)", fontFamily: "var(--cc-font-display)" }}
                                                >
                                                    {review.userName.charAt(0)}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <h3 className="font-bold cc-text-primary">{review.userName}</h3>
                                                    <div className="flex items-center gap-1">
                                                        {Array.from({ length: 5 }).map((_, i) => (
                                                            <Star
                                                                key={i}
                                                                className={`h-4 w-4 ${i < review.rating ? "fill-amber-500 text-amber-500" : "cc-text-tertiary"}`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="mt-1 text-xs font-semibold cc-text-tertiary">
                                                    {review.serviceType} | {new Date(review.createdAt).toLocaleDateString("es-CL")}
                                                </p>
                                                <p className="mt-3 text-sm leading-6 cc-text-secondary">{review.comment}</p>
                                            </div>
                                        </div>
                                    </article>
                                ))
                            ) : (
                                <div className="rounded-xl border border-dashed border-default bg-elevated p-8 text-center text-sm cc-text-secondary">
                                    Aun no hay resenas para este proveedor.
                                </div>
                            )}
                        </div>
                    </section>
                </main>

                <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                    <section className="rounded-[18px] border border-default bg-surface p-5">
                        <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${availability.bg} ${availability.text}`}>
                            <span className={`h-2 w-2 rounded-full ${availability.dot}`} />
                            <span className="text-xs font-bold">{availability.label}</span>
                        </div>
                        <Button onClick={() => setIsRequestDialogOpen(true)} className="w-full hover:opacity-90" style={{ backgroundColor: "var(--cc-copper)" }}>
                            <Send className="mr-2 h-4 w-4" />
                            Solicitar cotización
                        </Button>
                        <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "var(--cc-line)" }}>
                            <a href={`tel:${provider.contactPhone}`} className="flex items-center gap-3 text-sm cc-text-secondary transition hover:cc-text-primary">
                                <Phone className="h-4 w-4" style={{ color: "var(--cc-copper)" }} />
                                {provider.contactPhone}
                            </a>
                            {provider.email && (
                                <a href={`mailto:${provider.email}`} className="flex items-center gap-3 break-all text-sm cc-text-secondary transition hover:cc-text-primary">
                                    <Mail className="h-4 w-4 shrink-0" style={{ color: "var(--cc-copper)" }} />
                                    {provider.email}
                                </a>
                            )}
                            <p className="flex items-center gap-3 text-sm cc-text-secondary">
                                <Clock className="h-4 w-4" style={{ color: "var(--cc-copper)" }} />
                                Responde en {provider.responseTime}
                            </p>
                        </div>
                    </section>

                    {provider.verified && (
                        <section className="rounded-[18px] border p-5" style={{ borderColor: "rgba(156, 86, 54,0.20)", background: "var(--cc-copper-tint)" }}>
                            <div className="mb-2.5 flex items-center gap-2.5">
                                <BadgeCheck className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                                <h3 className="text-sm font-semibold cc-text-primary">Proveedor verificado</h3>
                            </div>
                            <p className="text-sm leading-6 cc-text-secondary">
                                Perfil revisado para operar dentro de comunidades, con reputación y datos de contacto visibles.
                            </p>
                        </section>
                    )}
                </aside>
            </div>

            <div className="fixed bottom-4 left-4 right-20 z-30 flex gap-2 rounded-2xl border p-2 shadow-lg lg:hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <Button onClick={() => setIsRequestDialogOpen(true)} className="h-12 flex-1 hover:opacity-90" style={{ backgroundColor: "var(--cc-ink)" }}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Solicitar servicio
                </Button>
                <a
                    href={`tel:${provider.contactPhone}`}
                    aria-label={`Llamar a ${provider.name}`}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border cc-text-primary"
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
        </>
    );
}
