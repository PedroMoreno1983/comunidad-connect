import type { ServiceProvider } from "@/lib/types";
import { realPhotoUrl } from "@/lib/utils/stockPhoto";
import {
    JOB_MARK_CAP,
    YEAR_MARK_CAP,
    glyphLabel,
    providerMarks,
    type ProviderMarks,
} from "@/components/services/providerMarks";

const SIZE = {
    compact: "h-24 w-24 sm:h-28 sm:w-28",
    card: "h-28 w-28 sm:h-[9.5rem] sm:w-[9.5rem]",
    profile: "h-32 w-32 sm:h-36 sm:w-36",
} as const;

function polar(cx: number, cy: number, radius: number, index: number, count: number, start: number, sweep: number) {
    const angle = count <= 1
        ? start + sweep / 2
        : start + (sweep * index) / (count - 1);
    const rad = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad), rad };
}

function GlyphSvg({ marks }: { marks: ProviderMarks }) {
    const yearMarks = Array.from({ length: marks.yearDots }, (_, index) =>
        polar(60, 60, 48, index, marks.yearDots, 200, 140));
    const jobMarks = Array.from({ length: marks.jobTicks }, (_, index) =>
        polar(60, 60, 40, index, marks.jobTicks, -70, 80));
    const ratingMarks = Array.from({ length: marks.ratingDots }, (_, index) =>
        polar(60, 60, 34, index, marks.ratingDots, 20, 50));

    return (
        <svg viewBox="0 0 120 120" className="h-full w-full" role="img" aria-label={glyphLabel(marks)}>
            <circle cx="60" cy="60" r="56" fill="var(--cc-paper)" stroke="var(--cc-ink)" strokeWidth="0.8" />
            <circle cx="60" cy="60" r="27" fill="none" stroke={marks.ink} strokeWidth="1.1" />
            {yearMarks.map((point, index) => (
                <circle key={`year-${index}`} cx={point.x} cy={point.y} r="1.7" fill="none" stroke="var(--cc-ink)" strokeWidth="0.8" />
            ))}
            {jobMarks.map((point, index) => (
                <line
                    key={`job-${index}`}
                    x1={point.x - Math.cos(point.rad) * 3.2}
                    y1={point.y - Math.sin(point.rad) * 3.2}
                    x2={point.x + Math.cos(point.rad) * 3.2}
                    y2={point.y + Math.sin(point.rad) * 3.2}
                    stroke="var(--cc-ink)"
                    strokeWidth="0.9"
                    strokeLinecap="round"
                />
            ))}
            {ratingMarks.map((point, index) => (
                <circle key={`rating-${index}`} cx={point.x} cy={point.y} r="1.8" fill={marks.ink} />
            ))}
            {marks.hasResponse ? (
                <path d="M18 60 C 22 56, 26 64, 32 60" fill="none" stroke={marks.ink} strokeWidth="1" strokeLinecap="round" />
            ) : null}
            <text
                x="60"
                y="64"
                textAnchor="middle"
                fill="var(--cc-ink)"
                fontFamily="var(--cc-font-display)"
                fontSize="18"
                fontWeight="520"
            >
                {marks.initials}
            </text>
        </svg>
    );
}

export function ProviderPortrait({
    provider,
    size = "card",
}: {
    provider: Pick<ServiceProvider, "id" | "name" | "photo" | "category" | "rating" | "reviewCount" | "yearsExperience" | "completedJobs" | "responseTime">;
    size?: keyof typeof SIZE;
}) {
    const photo = realPhotoUrl(provider.photo);
    const frame = `${SIZE[size]} shrink-0 overflow-hidden rounded-full border bg-[var(--cc-paper)]`;

    if (photo) {
        return (
            // Real upload. Stock hosts are stripped before this branch.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className={`${frame} object-cover`} style={{ borderColor: "var(--cc-ink)" }} />
        );
    }

    return (
        <div className={frame} style={{ borderColor: "var(--cc-ink)" }}>
            <GlyphSvg marks={providerMarks(provider)} />
        </div>
    );
}

export function ProfileBanner({ ink }: { ink: string }) {
    return (
        <svg className="h-full w-full" viewBox="0 0 800 180" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <rect width="800" height="180" fill="var(--cc-paper)" />
            {Array.from({ length: 9 }, (_, index) => (
                <path
                    key={index}
                    d={`M0 ${18 + index * 18} C 180 ${14 + index * 18}, 420 ${24 + index * 17}, 800 ${16 + index * 18}`}
                    fill="none"
                    stroke={ink}
                    strokeWidth="0.6"
                    opacity="0.45"
                />
            ))}
        </svg>
    );
}

function MarkRow({ marks }: { marks: ProviderMarks }) {
    const bits: { key: string; text: string }[] = [];
    if (marks.yearTotal > 0) {
        const capped = marks.yearTotal > YEAR_MARK_CAP ? `, ${YEAR_MARK_CAP} puntos` : "";
        bits.push({ key: "years", text: `${marks.yearTotal} años${capped}` });
    }
    if (marks.jobTotal > 0) {
        const capped = marks.jobTotal > JOB_MARK_CAP ? `, ${JOB_MARK_CAP} trazos` : "";
        bits.push({ key: "jobs", text: `${marks.jobTotal} trabajos${capped}` });
    }
    if (marks.ratingDots > 0) bits.push({ key: "rating", text: `${marks.ratingDots} puntos de valoración` });
    if (marks.hasResponse) bits.push({ key: "response", text: marks.responseLabel });
    if (bits.length === 0) return null;

    return (
        <p className="text-[13px] cc-text-secondary" style={{ fontFamily: "var(--cc-font-mono)" }}>
            {bits.map(bit => bit.text).join("  ·  ")}
        </p>
    );
}

export function ProviderDataLine({ provider }: { provider: ServiceProvider }) {
    return <MarkRow marks={providerMarks(provider)} />;
}

export function ProfileLegend({ provider }: { provider: ServiceProvider }) {
    const marks = providerMarks(provider);
    const rows = [
        { key: "ring", show: true, symbol: "anillo", text: "El anillo de color es el oficio. No agrega un dato nuevo." },
        { key: "initials", show: !realPhotoUrl(provider.photo), symbol: marks.initials, text: "Las iniciales reemplazan una foto que no fue subida." },
        { key: "years", show: marks.yearTotal > 0, symbol: "○", text: `Cada punto abierto es un año completo${marks.yearTotal > YEAR_MARK_CAP ? ` (se dibujan ${YEAR_MARK_CAP}; el número dice el total)` : ""}.` },
        { key: "jobs", show: marks.jobTotal > 0, symbol: "╱", text: `Cada trazo es un trabajo realizado${marks.jobTotal > JOB_MARK_CAP ? ` (se dibujan ${JOB_MARK_CAP}; el número dice el total)` : ""}.` },
        { key: "rating", show: marks.ratingDots > 0, symbol: "●", text: "Cada punto lleno es un punto de la valoración, solo si hay reseñas." },
        { key: "response", show: marks.hasResponse, symbol: "～", text: "La raya dice que hay un tiempo de respuesta publicado. No mide minutos." },
        { key: "verified", show: provider.verified && provider.specialties.length > 0, symbol: "✓", text: "La marca del chip dice que el perfil está verificado. No cuenta validaciones por aptitud." },
    ].filter(row => row.show);

    return (
        <section>
            <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Cómo leer este perfil</h2>
            <p className="mt-2 text-sm italic cc-text-secondary" style={{ fontFamily: "var(--cc-font-display)" }}>
                Si un dato no está publicado, su marca no aparece.
            </p>
            <ul className="mt-4 space-y-2">
                {rows.map(row => (
                    <li key={row.key} className="flex items-baseline gap-3 text-sm cc-text-secondary">
                        <span className="w-8 shrink-0 text-center text-base cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{row.symbol}</span>
                        <span>{row.text}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function ReviewerMark({ name, photo }: { name: string; photo?: string }) {
    const real = realPhotoUrl(photo);
    if (real) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={real} alt="" className="h-11 w-11 shrink-0 rounded-full border object-cover" style={{ borderColor: "var(--cc-ink)" }} />
        );
    }
    const initials = name
        .split(" ")
        .map(word => word[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 2) || "·";
    return (
        <svg viewBox="0 0 44 44" className="h-11 w-11 shrink-0" aria-hidden>
            <circle cx="22" cy="22" r="20" fill="var(--cc-paper)" stroke="var(--cc-ink)" strokeWidth="0.8" />
            <text x="22" y="26" textAnchor="middle" fill="var(--cc-ink)" fontFamily="var(--cc-font-display)" fontSize="13">
                {initials}
            </text>
        </svg>
    );
}
