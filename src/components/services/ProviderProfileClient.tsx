"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Briefcase,
    Calendar,
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
import { getCategoryVisual } from "@/components/services/categoryVisuals";
import { ProfileBanner, ProfileLegend, ProviderPortrait, ReviewerMark } from "@/components/services/ProviderGlyph";
import { categoryInk, providerMarks } from "@/components/services/providerMarks";
import {
    availabilityCopy,
    providerHeadline,
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
    const price = providerPrice(provider);
    const availability = availabilityCopy(provider.availability);
    const headline = providerHeadline(provider);
    const marks = providerMarks(provider);
    const breakdown = ratingBreakdown(reviews);
    const messageHref = whatsappUrl(provider.contactPhone) || (provider.email ? `mailto:${provider.email}` : "");
    const aboveResidentNav = user?.role === "resident";
    const firstName = provider.name.split(" ")[0];
    const responseTime = marks.responseLabel;
    const specialties = (provider.specialties ?? []).filter(item => item.trim().length > 0);
    const trajectory = [
        marks.yearTotal > 0
            ? { key: "years", title: `${provider.yearsExperience} años de experiencia`, note: headline }
            : null,
        marks.jobTotal > 0
            ? { key: "jobs", title: `${provider.completedJobs} trabajos realizados`, note: "Cifra publicada en el perfil" }
            : null,
        ...(provider.certifications ?? [])
            .filter(item => item.trim().length > 0)
            .map(cert => ({ key: cert, title: cert, note: "Certificación publicada" })),
    ].filter((item): item is { key: string; title: string; note: string } => Boolean(item));

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

    const figures = [
        provider.reviewCount > 0 ? { value: String(provider.rating), label: `${provider.reviewCount} reseña${provider.reviewCount === 1 ? "" : "s"}` } : null,
        marks.jobTotal > 0 ? { value: String(provider.completedJobs), label: "trabajos" } : null,
        marks.yearTotal > 0 ? { value: String(provider.yearsExperience), label: "años" } : null,
        responseTime ? { value: responseTime, label: "respuesta" } : null,
    ].filter((stat): stat is { value: string; label: string } => Boolean(stat));

    return (
        <div className="pb-28 lg:pb-0">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-10">
                    <header className="overflow-hidden rounded-3xl border" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }}>
                        <div className="h-32 sm:h-40">
                            <ProfileBanner ink={categoryInk(provider.category)} />
                        </div>
                        <div className="px-5 pb-6 sm:px-8">
                            <div className="-mt-14">
                                <div className="inline-block rounded-full bg-[var(--cc-paper-warm)] p-1">
                                    <ProviderPortrait provider={provider} size="profile" />
                                </div>
                            </div>
                            <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
                                <h1
                                    className="text-4xl leading-none tracking-[-0.03em] cc-text-primary sm:text-5xl"
                                    style={{ fontFamily: "var(--cc-font-display)", fontWeight: 520 }}
                                >
                                    {provider.name}
                                </h1>
                                {provider.verified ? (
                                    <span className="pb-1 text-sm italic" style={{ color: "var(--cc-sage)", fontFamily: "var(--cc-font-display)" }}>
                                        perfil verificado
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-3 max-w-xl text-lg italic cc-text-secondary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                {headline}
                            </p>
                            <p className="mt-3 inline-flex items-center gap-2 text-sm cc-text-secondary">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: availability.color }} />
                                {availability.label}
                                {provider.reviewCount > 0 ? (
                                    <span className="cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                        {provider.rating}
                                        <span className="ml-1 text-xs cc-text-tertiary" style={{ fontFamily: "var(--cc-font-sans)" }}>
                                            {provider.reviewCount} reseñas
                                        </span>
                                    </span>
                                ) : (
                                    <span className="text-xs cc-text-tertiary">Sin reseñas todavía</span>
                                )}
                            </p>
                            {figures.length > 0 ? (
                                <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
                                    {figures.map(figure => (
                                        <div key={figure.label}>
                                            <dd
                                                className="text-3xl leading-none tracking-[-0.03em] cc-text-primary"
                                                style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                                            >
                                                {figure.value}
                                            </dd>
                                            <dt className="mt-1 text-xs italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>{figure.label}</dt>
                                        </div>
                                    ))}
                                </dl>
                            ) : null}
                        </div>
                    </header>

                    <section>
                        <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Acerca de</h2>
                        {provider.bio ? (
                            <p className="mt-3 max-w-2xl text-[15px] leading-7 cc-text-secondary">{provider.bio}</p>
                        ) : (
                            <p className="mt-3 text-sm italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                {firstName} todavía no escribió una presentación.
                            </p>
                        )}
                    </section>

                    <section>
                        <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Experiencia</h2>
                        {trajectory.length > 0 ? (
                            <ol className="mt-4 space-y-0 border-l" style={{ borderColor: "var(--cc-ink)" }}>
                                {trajectory.map(item => (
                                    <li key={item.key} className="relative pb-6 pl-6 last:pb-0">
                                        <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full" style={{ background: marks.ink }} />
                                        <p className="text-base cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{item.title}</p>
                                        <p className="mt-1 text-sm italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>{item.note}</p>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="mt-3 text-sm italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Sin trayectoria publicada.
                            </p>
                        )}
                    </section>

                    {specialties.length > 0 ? (
                        <section>
                            <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Aptitudes</h2>
                            <ul className="mt-3 flex flex-wrap gap-2">
                                {specialties.map(specialty => (
                                    <li
                                        key={specialty}
                                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm cc-text-primary"
                                        style={{ borderColor: "var(--cc-ink)", background: "transparent" }}
                                    >
                                        {provider.verified ? (
                                            <span aria-hidden className="text-xs" style={{ color: "var(--cc-sage)" }}>✓</span>
                                        ) : null}
                                        {specialty}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    <section>
                        <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Servicios y precios</h2>
                        {price.hasRate || specialties.length > 0 ? (
                            <div className="mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" }}>
                                <div className="flex items-baseline justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--cc-line)" }}>
                                    <div>
                                        <p className="text-sm cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{headline}</p>
                                        <p className="mt-1 text-xs italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                            {price.hasRate ? "Tarifa por hora publicada" : "Sin tarifa por hora"}
                                        </p>
                                    </div>
                                    <p
                                        className="text-3xl cc-text-primary"
                                        style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                                    >
                                        {price.headline}
                                        {price.hasRate ? <span className="ml-1 text-sm cc-text-tertiary">/ hora</span> : null}
                                    </p>
                                </div>
                                {specialties.length > 0 ? (
                                    <ul>
                                        {specialties.map(specialty => (
                                            <li key={specialty} className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm first:border-t-0" style={{ borderColor: "var(--cc-line)" }}>
                                                <span className="cc-text-primary">{specialty}</span>
                                                <span className="italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>Precio al contactar</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Este perfil no publica servicios ni tarifas. El precio se acuerda al contactar.
                            </p>
                        )}
                    </section>

                    <section>
                        <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Actividad</h2>
                        <ul className="mt-3 space-y-2 text-sm cc-text-secondary">
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: availability.color }} />
                                {availability.label}
                            </li>
                            {responseTime ? <li>Suele responder en {responseTime}</li> : null}
                            {provider.reviewCount > 0 ? (
                                <li>{provider.reviewCount} reseña{provider.reviewCount === 1 ? "" : "s"} publicada{provider.reviewCount === 1 ? "" : "s"}</li>
                            ) : null}
                        </ul>
                        <p className="mt-3 max-w-xl text-sm italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>
                            No hay una grilla semanal publicada. Al reservar puedes proponer el día y la hora.
                        </p>
                    </section>

                    <section>
                        <div className="flex items-end justify-between gap-3">
                            <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Recomendaciones</h2>
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
                                <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end">
                                    <div>
                                        <p
                                            className="text-6xl leading-none cc-text-primary"
                                            style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                                        >
                                            {provider.rating}
                                        </p>
                                        <p className="mt-2 text-xs italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                            {reviews.length} reseña{reviews.length === 1 ? "" : "s"}
                                        </p>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        {breakdown.map(row => (
                                            <div key={row.star} className="flex items-center gap-3 text-xs cc-text-secondary">
                                                <span className="w-3 text-right" style={{ fontFamily: "var(--cc-font-mono)" }}>{row.star}</span>
                                                <div className="h-px flex-1" style={{ background: "var(--cc-line-strong)" }}>
                                                    <div className="h-px" style={{ width: `${row.pct}%`, background: "var(--cc-ink)" }} />
                                                </div>
                                                <span className="w-8" style={{ fontFamily: "var(--cc-font-mono)" }}>{row.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="mt-6 space-y-6">
                                    {reviews.map(review => (
                                        <article key={review.id} className="flex items-start gap-3">
                                            <ReviewerMark name={review.userName} photo={review.userAvatar} />
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-sm cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{review.userName}</h3>
                                                <p className="mt-0.5 text-xs cc-text-tertiary">
                                                    {review.serviceType ? `${getCategoryVisual(review.serviceType).label} · ` : ""}
                                                    {new Date(review.createdAt).toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" })}
                                                    {" · "}
                                                    {review.rating}
                                                </p>
                                                <p className="mt-2 text-base italic leading-7 cc-text-secondary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                                    “{review.comment}”
                                                </p>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="mt-3 text-sm italic cc-text-tertiary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Aún no hay recomendaciones. Si {firstName} trabajó en tu unidad, puedes contar cómo fue.
                            </p>
                        )}
                    </section>

                    <ProfileLegend provider={provider} />
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
        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }}>
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
