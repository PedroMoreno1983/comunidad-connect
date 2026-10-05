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
    MessageCircle,
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
import { useAuth } from "@/lib/authContext";
import { getInitials } from "@/lib/utils/avatar";
import { getCategoryVisual } from "@/components/services/categoryVisuals";
import {
    availabilityCopy,
    providerPrice,
    whatsappUrl,
} from "@/components/services/providerPresentation";

interface ProviderProfileClientProps {
    provider: ServiceProvider;
    reviews: Review[];
    openContact?: boolean;
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

export function ProviderProfileClient({ provider, reviews, openContact = false }: ProviderProfileClientProps) {
    const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(openContact);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [isRequestSaving, setIsRequestSaving] = useState(false);
    const [isReviewSaving, setIsReviewSaving] = useState(false);
    const [requestForm, setRequestForm] = useState({ date: "", time: "", description: "" });
    const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();
    const visual = getCategoryVisual(provider.category);
    const price = providerPrice(provider);
    const availability = availabilityCopy(provider.availability);
    const breakdown = ratingBreakdown(reviews);
    const messageHref = whatsappUrl(provider.contactPhone) || (provider.email ? `mailto:${provider.email}` : "");
    const aboveResidentNav = user?.role === "resident";
    const firstName = provider.name.split(" ")[0];
    const responseTime = provider.responseTime?.trim() ?? "";

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
                        title: "Debes iniciar sesión",
                        description: "Inicia sesión para solicitar un servicio.",
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
                description: "Revisa los datos e intenta nuevamente. Si el problema continúa, contacta a administración.",
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
                        title: "Debes iniciar sesión",
                        description: "Inicia sesión para dejar una reseña.",
                        variant: "default",
                    });
                    return;
                }
                throw new Error(data.error || "Error al publicar reseña");
            }

            toast({
                title: "Reseña publicada",
                description: "Gracias por compartir tu experiencia.",
                variant: "success",
            });
            setIsReviewDialogOpen(false);
            setReviewForm({ rating: 5, comment: "" });
            router.refresh();
        } catch (error: unknown) {
            console.error("[ProviderProfile] submit review failed:", error);
            toast({
                title: "No pudimos publicar la reseña",
                description: "Intenta nuevamente en unos segundos.",
                variant: "destructive",
            });
        } finally {
            setIsReviewSaving(false);
        }
    };

    const stats = [
        provider.reviewCount > 0
            ? { value: String(provider.rating), label: `${provider.reviewCount} reseña${provider.reviewCount === 1 ? "" : "s"}` }
            : null,
        provider.completedJobs > 0
            ? { value: String(provider.completedJobs), label: "trabajos" }
            : null,
        provider.yearsExperience > 0
            ? { value: String(provider.yearsExperience), label: "años" }
            : null,
        responseTime
            ? { value: responseTime, label: "respuesta" }
            : null,
    ].filter((stat): stat is { value: string; label: string } => Boolean(stat));

    return (
        <div className="pb-28 lg:pb-0">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-8">
                    <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
                        {provider.photo ? (
                            <img
                                src={provider.photo}
                                alt=""
                                className="h-36 w-36 shrink-0 rounded-2xl object-cover sm:h-44 sm:w-44"
                            />
                        ) : (
                            <div
                                className="grid h-36 w-36 shrink-0 place-items-center rounded-2xl text-5xl text-white sm:h-44 sm:w-44"
                                style={{ background: visual.gradient, fontFamily: "var(--cc-font-display)" }}
                            >
                                {getInitials(provider.name)}
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1
                                    className="text-4xl leading-none tracking-[-0.03em] cc-text-primary sm:text-5xl"
                                    style={{ fontFamily: "var(--cc-font-display)", fontWeight: 520 }}
                                >
                                    {provider.name}
                                </h1>
                                {provider.verified && (
                                    <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--cc-sage)" }}>
                                        <BadgeCheck className="h-5 w-5" aria-hidden />
                                        Verificado
                                    </span>
                                )}
                            </div>
                            <p className="mt-3 text-base cc-text-secondary">{visual.label}</p>
                            {provider.reviewCount > 0 ? (
                                <p className="mt-3 inline-flex items-center gap-1.5 text-sm">
                                    <Star className="h-4 w-4" style={{ color: "var(--cc-amber)", fill: "var(--cc-amber)" }} />
                                    <strong className="cc-text-primary">{provider.rating}</strong>
                                    <span className="cc-text-tertiary">{provider.reviewCount} reseñas</span>
                                </p>
                            ) : (
                                <p className="mt-3 text-sm cc-text-tertiary">Sin reseñas todavía</p>
                            )}
                            {stats.length > 0 && (
                                <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {stats.map(stat => (
                                        <div key={stat.label} className="rounded-xl border bg-white px-3 py-3" style={{ borderColor: "var(--cc-line)" }}>
                                            <dt className="text-[11px] uppercase tracking-[0.12em] cc-text-tertiary">{stat.label}</dt>
                                            <dd
                                                className="mt-1 truncate text-lg cc-text-primary"
                                                style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                                            >
                                                {stat.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </div>
                    </header>

                    <section>
                        <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Sobre mí</h2>
                        {provider.bio ? (
                            <p className="mt-3 max-w-2xl text-[15px] leading-7 cc-text-secondary">{provider.bio}</p>
                        ) : (
                            <p className="mt-3 rounded-2xl border border-dashed bg-white p-6 text-sm cc-text-tertiary" style={{ borderColor: "var(--cc-line-strong)" }}>
                                {firstName} todavía no escribió una presentación.
                            </p>
                        )}
                    </section>

                    <section>
                        <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Servicios y precios</h2>
                        {price.hasRate || provider.specialties.length > 0 ? (
                            <div className="mt-3 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "var(--cc-line)" }}>
                                <div className="flex items-baseline justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--cc-line)" }}>
                                    <div>
                                        <p className="text-sm font-semibold cc-text-primary">{visual.label}</p>
                                        <p className="mt-1 text-xs cc-text-tertiary">
                                            {price.hasRate ? "Tarifa por hora publicada" : "Sin tarifa por hora"}
                                        </p>
                                    </div>
                                    <p
                                        className="text-2xl cc-text-primary"
                                        style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                                    >
                                        {price.hasRate ? `desde ${price.headline}` : price.headline}
                                        {price.hasRate ? <span className="ml-1 text-sm cc-text-tertiary">/ hora</span> : null}
                                    </p>
                                </div>
                                {provider.specialties.length > 0 ? (
                                    <ul className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                        {provider.specialties.map(specialty => (
                                            <li key={specialty} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                                                <span className="cc-text-primary">{specialty}</span>
                                                <span className="cc-text-tertiary">Precio al contactar</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        ) : (
                            <p className="mt-3 rounded-2xl border border-dashed bg-white p-6 text-sm cc-text-tertiary" style={{ borderColor: "var(--cc-line-strong)" }}>
                                Este perfil no publica servicios ni tarifas. El precio se acuerda al contactar.
                            </p>
                        )}
                    </section>

                    <section>
                        <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Disponibilidad</h2>
                        <div className="mt-3 rounded-2xl border bg-white p-5" style={{ borderColor: "var(--cc-line)" }}>
                            <p className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: availability.color }}>
                                <span className="h-2 w-2 rounded-full" style={{ background: availability.color }} />
                                {availability.label}
                            </p>
                            <p className="mt-3 max-w-xl text-sm leading-6 cc-text-secondary">
                                No hay una grilla semanal publicada. Al reservar puedes proponer el día y la hora.
                            </p>
                        </div>
                    </section>

                    {provider.specialties.length > 0 && (
                        <section>
                            <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Especialidades</h2>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {provider.specialties.map(specialty => (
                                    <span
                                        key={specialty}
                                        className="rounded-full border bg-white px-4 py-1.5 text-sm cc-text-secondary"
                                        style={{ borderColor: "var(--cc-line)" }}
                                    >
                                        {specialty}
                                    </span>
                                ))}
                            </div>
                        </section>
                    )}

                    {provider.certifications.length > 0 && (
                        <section>
                            <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Certificaciones</h2>
                            <ul className="mt-3 space-y-3">
                                {provider.certifications.map(cert => (
                                    <li key={cert} className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3" style={{ borderColor: "var(--cc-line)" }}>
                                        <CheckCircle className="h-5 w-5 shrink-0" style={{ color: "var(--cc-sage)" }} />
                                        <span className="text-sm font-medium cc-text-primary">{cert}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <section>
                        <div className="flex items-end justify-between gap-3">
                            <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Reseñas</h2>
                            <button
                                type="button"
                                onClick={() => setIsReviewDialogOpen(true)}
                                className="text-sm font-semibold"
                                style={{ color: "var(--cc-copper)" }}
                            >
                                Escribir reseña
                            </button>
                        </div>

                        {reviews.length > 0 ? (
                            <>
                                <div className="mt-4 flex flex-col gap-6 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center" style={{ borderColor: "var(--cc-line)" }}>
                                    <div className="text-center sm:w-36">
                                        <p
                                            className="text-5xl cc-text-primary"
                                            style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                                        >
                                            {provider.rating}
                                        </p>
                                        <div className="mt-2 flex justify-center gap-0.5">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <Star
                                                    key={i}
                                                    className="h-4 w-4"
                                                    style={{
                                                        color: "var(--cc-amber)",
                                                        fill: i < Math.round(provider.rating) ? "var(--cc-amber)" : "transparent",
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <p className="mt-2 text-xs cc-text-tertiary">{reviews.length} reseña{reviews.length === 1 ? "" : "s"}</p>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        {breakdown.map(row => (
                                            <div key={row.star} className="flex items-center gap-3 text-xs cc-text-secondary">
                                                <span className="w-3 text-right font-semibold">{row.star}</span>
                                                <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--cc-ivory-soft)" }}>
                                                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: "var(--cc-amber)" }} />
                                                </div>
                                                <span className="w-8 tabular-nums cc-text-tertiary">{row.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {reviews.map(review => (
                                        <article key={review.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: "var(--cc-line)" }}>
                                            <div className="flex items-start gap-3">
                                                {review.userAvatar ? (
                                                    <img src={review.userAvatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                                                ) : (
                                                    <div
                                                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm text-white"
                                                        style={{ background: visual.gradient, fontFamily: "var(--cc-font-display)" }}
                                                    >
                                                        {review.userName.charAt(0)}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="text-sm font-semibold cc-text-primary">{review.userName}</h3>
                                                        <span className="inline-flex items-center gap-0.5">
                                                            {Array.from({ length: 5 }).map((_, i) => (
                                                                <Star
                                                                    key={i}
                                                                    className="h-3.5 w-3.5"
                                                                    style={{
                                                                        color: "var(--cc-amber)",
                                                                        fill: i < review.rating ? "var(--cc-amber)" : "transparent",
                                                                    }}
                                                                />
                                                            ))}
                                                        </span>
                                                    </div>
                                                    <p className="mt-0.5 text-xs cc-text-tertiary">
                                                        {new Date(review.createdAt).toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" })}
                                                    </p>
                                                    <p className="mt-2 text-sm leading-6 cc-text-secondary">{review.comment}</p>
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="mt-3 rounded-2xl border border-dashed bg-white p-8 text-center text-sm cc-text-tertiary" style={{ borderColor: "var(--cc-line-strong)" }}>
                                Aún no hay reseñas. Si {firstName} trabajó en tu unidad, puedes contar cómo fue.
                            </p>
                        )}
                    </section>
                </div>

                <aside className="hidden lg:block lg:sticky lg:top-24">
                    <BookingCard
                        provider={provider}
                        priceHeadline={price.headline}
                        priceCaption={price.hasRate ? "por hora" : price.caption}
                        showDesde={price.hasRate}
                        messageHref={messageHref}
                        responseTime={responseTime}
                        availabilityLabel={availability.label}
                        availabilityColor={availability.color}
                        onContact={() => setIsRequestDialogOpen(true)}
                    />
                </aside>
            </div>

            <div
                className="fixed inset-x-0 z-30 border-t bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(26,22,17,0.08)] lg:hidden"
                style={{
                    borderColor: "var(--cc-line)",
                    bottom: aboveResidentNav ? "4.75rem" : "0px",
                }}
            >
                <div className="mx-auto flex max-w-3xl items-center gap-3">
                    <div className="min-w-0">
                        {price.hasRate ? <p className="text-[10px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Desde</p> : null}
                        <p className="truncate text-xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{price.headline}</p>
                    </div>
                    <Button
                        onClick={() => setIsRequestDialogOpen(true)}
                        className="h-12 flex-1 rounded-xl text-sm font-semibold"
                        style={{ background: "var(--cc-copper)", color: "#fff" }}
                    >
                        Contactar
                    </Button>
                    {messageHref ? (
                        <a
                            href={messageHref}
                            target={messageHref.startsWith("http") ? "_blank" : undefined}
                            rel={messageHref.startsWith("http") ? "noopener noreferrer" : undefined}
                            aria-label={`Enviar mensaje a ${provider.name}`}
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border cc-text-primary"
                            style={{ borderColor: "var(--cc-line-strong)" }}
                        >
                            <MessageCircle className="h-4 w-4" />
                        </a>
                    ) : null}
                </div>
            </div>

            <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Contactar a {provider.name}</DialogTitle>
                        <DialogDescription>
                            Propón fecha, hora y el trabajo. La solicitud queda registrada en Mis solicitudes.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRequestService} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary" htmlFor="request-date">Fecha preferida</label>
                            <Input
                                id="request-date"
                                type="date"
                                required
                                value={requestForm.date}
                                onChange={(e) => setRequestForm({ ...requestForm, date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary" htmlFor="request-time">Hora preferida</label>
                            <Input
                                id="request-time"
                                type="time"
                                required
                                value={requestForm.time}
                                onChange={(e) => setRequestForm({ ...requestForm, time: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary" htmlFor="request-description">Descripción del servicio</label>
                            <textarea
                                id="request-description"
                                className="min-h-[100px] w-full rounded-xl border border-default bg-surface px-3 py-2 text-sm cc-text-primary focus:outline-none focus:border-[var(--cc-copper)] focus:ring-4 focus:ring-[var(--cc-copper)]/15"
                                placeholder="Describe el servicio que necesitas..."
                                required
                                value={requestForm.description}
                                onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isRequestSaving} style={{ background: "var(--cc-copper)", color: "#fff" }}>
                                {isRequestSaving ? "Enviando..." : "Enviar solicitud"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Dejar una reseña</DialogTitle>
                        <DialogDescription>
                            Comparte tu experiencia con {provider.name}.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmitReview} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary">Calificación</label>
                            <div className="flex gap-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setReviewForm({ ...reviewForm, rating: i + 1 })}
                                        className="focus:outline-none"
                                        aria-label={`${i + 1} estrellas`}
                                    >
                                        <Star
                                            className="h-8 w-8"
                                            style={{
                                                color: "var(--cc-amber)",
                                                fill: i < reviewForm.rating ? "var(--cc-amber)" : "transparent",
                                            }}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary" htmlFor="review-comment">Tu comentario</label>
                            <textarea
                                id="review-comment"
                                className="min-h-[120px] w-full rounded-xl border border-default bg-surface px-3 py-2 text-sm cc-text-primary focus:outline-none focus:border-[var(--cc-copper)] focus:ring-4 focus:ring-[var(--cc-copper)]/15"
                                placeholder="Cuéntanos sobre tu experiencia..."
                                required
                                value={reviewForm.comment}
                                onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isReviewSaving} style={{ background: "var(--cc-copper)", color: "#fff" }}>
                                {isReviewSaving ? "Publicando..." : "Publicar reseña"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function BookingCard({
    provider,
    priceHeadline,
    priceCaption,
    showDesde,
    messageHref,
    responseTime,
    availabilityLabel,
    availabilityColor,
    onContact,
}: {
    provider: ServiceProvider;
    priceHeadline: string;
    priceCaption: string;
    showDesde: boolean;
    messageHref: string;
    responseTime: string;
    availabilityLabel: string;
    availabilityColor: string;
    onContact: () => void;
}) {
    return (
        <section className="rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(26,22,17,0.04),0_16px_40px_-24px_rgba(26,22,17,0.45)]" style={{ borderColor: "var(--cc-line)" }}>
            {showDesde ? <p className="text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Desde</p> : null}
            <p
                className="mt-1 text-4xl leading-none tracking-[-0.03em] cc-text-primary"
                style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
            >
                {priceHeadline}
            </p>
            <p className="mt-2 text-sm cc-text-tertiary">{priceCaption}</p>
            <Button
                onClick={onContact}
                className="mt-5 h-12 w-full rounded-xl text-[15px] font-semibold"
                style={{ background: "var(--cc-copper)", color: "#fff" }}
            >
                <Calendar className="h-4 w-4" />
                Reservar
            </Button>
            {messageHref ? (
                <a
                    href={messageHref}
                    target={messageHref.startsWith("http") ? "_blank" : undefined}
                    rel={messageHref.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold cc-text-primary"
                    style={{ borderColor: "var(--cc-line-strong)", background: "#fff" }}
                >
                    <MessageCircle className="h-4 w-4" />
                    Enviar mensaje
                </a>
            ) : null}
            <ul className="mt-5 space-y-3 border-t pt-4 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
                <li className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: availabilityColor }} />
                    {availabilityLabel}
                </li>
                {responseTime ? (
                    <li className="flex items-center gap-2">
                        <Clock className="h-4 w-4 cc-text-tertiary" />
                        Suele responder en {responseTime}
                    </li>
                ) : null}
                {provider.completedJobs > 0 ? (
                    <li className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 cc-text-tertiary" />
                        {provider.completedJobs} trabajos realizados
                    </li>
                ) : null}
            </ul>
        </section>
    );
}
