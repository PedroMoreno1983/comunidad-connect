"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Loader2, Send, ShieldCheck, User } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type {
    AdminOnboardingRegisterResponse,
    OnboardingConversationDraft,
    OnboardingConversationMessage,
    OnboardingGuideResponse,
} from "@/lib/types";
import { onboardingPrefillFromQuery } from "@/lib/onboardingPrefill";

const INITIAL_DRAFT: OnboardingConversationDraft = {
    communityName: "",
    unitType: null,
    unitCount: null,
    unitNumbers: [],
    address: "",
    fullName: "",
    email: "",
    planId: null,
};

const WELCOME: OnboardingConversationMessage = {
    role: "assistant",
    content: "Hola, soy CoCo. Cuéntame cómo se llama tu condominio, dónde está y si tiene casas, sitios o departamentos. Puedes hablarme con tus propias palabras.",
};

export default function AdminOnboardingPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [messages, setMessages] = useState<OnboardingConversationMessage[]>([WELCOME]);
    const [draft, setDraft] = useState<OnboardingConversationDraft>(INITIAL_DRAFT);
    const [ready, setReady] = useState(false);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [acceptPrivacy, setAcceptPrivacy] = useState(false);
    const [approveDraft, setApproveDraft] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, ready]);

    useEffect(() => {
        const prefill = onboardingPrefillFromQuery(window.location.search);
        if (!prefill) return;
        setDraft(prefill);
        setReady(true);
        setMessages([{
            role: "assistant",
            content: `Preparé el borrador de ${prefill.communityName} con ${prefill.unitCount} sitios, numerados del ${prefill.unitNumbers[0]} al ${prefill.unitNumbers.at(-1)}. Revisa los datos abajo. Si algo debe cambiar, dímelo aquí antes de aprobar.`,
        }]);
    }, []);

    const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const message = input.trim();
        if (!message || sending) return;
        setInput("");
        setError("");
        setSending(true);
        const history = messages.slice(1);
        setMessages(previous => [...previous, { role: "user", content: message }]);
        try {
            const response = await fetch("/api/admin-onboarding/guide", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message, history, draft }),
            });
            const result = await response.json() as OnboardingGuideResponse;
            if (!response.ok || !result.reply || !result.draft) {
                throw new Error(result.error || "CoCo no pudo responder ahora.");
            }
            setDraft(result.draft);
            setReady(result.ready);
            setApproveDraft(false);
            setMessages(previous => [...previous, { role: "assistant", content: result.reply }]);
        } catch (cause) {
            const messageText = cause instanceof Error ? cause.message : "Intenta nuevamente.";
            setError(messageText);
            setInput(message);
            setMessages(previous => previous.slice(0, -1));
        } finally {
            setSending(false);
        }
    };

    const createCommunity = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!ready || !approveDraft || !acceptTerms || !acceptPrivacy) return;
        if (password.length < 8 || password !== confirmPassword) {
            toast({ title: "Revisa tu contraseña", description: "Debe tener al menos 8 caracteres y coincidir en ambos campos.", variant: "destructive" });
            return;
        }
        setSubmitting(true);
        try {
            const response = await fetch("/api/admin-onboarding/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: draft.planId,
                    communityName: draft.communityName,
                    address: draft.address,
                    units: draft.unitCount,
                    unitType: draft.unitType,
                    unitNumbers: draft.unitType === "house" ? draft.unitNumbers : [],
                    fullName: draft.fullName,
                    email: draft.email,
                    password,
                    acceptTerms,
                    acceptPrivacy,
                }),
            });
            const result = await response.json() as AdminOnboardingRegisterResponse;
            if (!response.ok) {
                if (response.status === 409 && result.code === "EMAIL_ALREADY_REGISTERED") {
                    router.push(result.loginUrl || "/login");
                    return;
                }
                throw new Error(result.error || "No se pudo crear la comunidad.");
            }
            toast({ title: "Comunidad creada", description: `Revisa ${draft.email} para confirmar tu correo y continuar con CoCo.`, variant: "success" });
            router.push(`/login?check_email=1&next=%2Fadmin%2Fonboarding&email=${encodeURIComponent(draft.email)}`);
        } catch (cause) {
            toast({ title: "No se pudo crear la comunidad", description: cause instanceof Error ? cause.message : "Intenta nuevamente.", variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-canvas px-4 py-6 sm:py-10">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
                <header className="flex items-center justify-between gap-4">
                    <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold cc-text-secondary"><ArrowLeft className="h-4 w-4" /> Volver</Link>
                    <Link href="/login" className="text-sm font-semibold text-brand-600">Ya tengo cuenta</Link>
                </header>

                <div className="rounded-2xl border border-subtle bg-surface p-5 sm:p-7">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white"><Bot className="h-6 w-6" /></span>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Activación con CoCo</p>
                            <h1 className="text-2xl font-semibold cc-text-primary sm:text-3xl">Conversemos sobre tu comunidad</h1>
                        </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 cc-text-secondary">CoCo reúne los datos contigo. Nada se crea hasta que revises el resumen y lo apruebes. No escribas contraseñas en el chat.</p>
                </div>

                <section aria-label="Conversación con CoCo" className="flex min-h-[430px] flex-col rounded-2xl border border-subtle bg-surface shadow-sm">
                    <div className="max-h-[60vh] flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
                        {messages.map((message, index) => (
                            <div key={`${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-brand-500 text-white" : "bg-canvas cc-text-primary"}`}>
                                    {message.role === "assistant" && <span className="mb-1 block text-xs font-bold text-brand-600">CoCo</span>}
                                    {message.content}
                                </div>
                            </div>
                        ))}
                        {sending && <div className="flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> CoCo está pensando…</div>}
                        <div ref={bottomRef} />
                    </div>
                    {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6">{error}</p>}
                    <form onSubmit={sendMessage} className="flex gap-2 border-t border-subtle p-4 sm:p-5">
                        <label htmlFor="coco-message" className="sr-only">Escribe a CoCo</label>
                        <input id="coco-message" value={input} onChange={event => setInput(event.target.value)} maxLength={1500} placeholder="Cuéntale a CoCo sobre tu condominio…" className="min-w-0 flex-1 rounded-xl border border-subtle bg-canvas px-4 py-3 text-sm outline-none focus:border-brand-500" />
                        <button type="submit" disabled={sending || !input.trim()} aria-label="Enviar mensaje" className="rounded-xl bg-brand-500 px-4 text-white disabled:opacity-50"><Send className="h-5 w-5" /></button>
                    </form>
                </section>

                {ready && (
                    <form onSubmit={createCommunity} className="space-y-5 rounded-2xl border border-subtle bg-surface p-5 shadow-sm sm:p-7">
                        <div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-emerald-600" /><h2 className="text-xl font-semibold cc-text-primary">Revisa lo que CoCo preparó</h2></div>
                        <div className="grid gap-3 rounded-xl bg-canvas p-4 text-sm sm:grid-cols-2">
                            <p><strong>Comunidad:</strong> {draft.communityName}</p>
                            <p><strong>Unidades:</strong> {draft.unitCount} {draft.unitType === "house" ? "casas / sitios" : "departamentos"}</p>
                            <p><strong>Dirección:</strong> {draft.address || "Por completar después"}</p>
                            <p><strong>Administrador:</strong> {draft.fullName} · {draft.email}</p>
                            <p><strong>Plan:</strong> {draft.planId ? "Elegido para revisión" : "Por decidir"}</p>
                            <p><strong>Sitios a crear:</strong> {draft.unitType === "house" ? draft.unitNumbers.length : "No aplica"}</p>
                            {draft.unitType === "house" && draft.unitNumbers.length > 0 && <p className="max-h-24 overflow-y-auto break-words sm:col-span-2"><strong>Identificadores:</strong> {draft.unitNumbers.join(", ")}</p>}
                        </div>
                        <p className="text-sm cc-text-secondary">Si algo está mal, díselo a CoCo en el chat. La contraseña se ingresa aquí y no se envía al agente.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-sm font-semibold cc-text-primary">Contraseña<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-subtle bg-canvas px-4 py-3 text-sm" /></label>
                            <label className="text-sm font-semibold cc-text-primary">Confirmar contraseña<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-subtle bg-canvas px-4 py-3 text-sm" /></label>
                        </div>
                        <div className="space-y-3 text-sm cc-text-secondary">
                            <label className="flex items-start gap-3"><input type="checkbox" checked={approveDraft} onChange={event => setApproveDraft(event.target.checked)} required className="mt-1" /><span>Revisé los datos y autorizo crear esta comunidad.</span></label>
                            <label className="flex items-start gap-3"><input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} required className="mt-1" /><span>Acepto los <Link href="/terms" target="_blank" className="font-semibold underline">términos del servicio</Link>.</span></label>
                            <label className="flex items-start gap-3"><input type="checkbox" checked={acceptPrivacy} onChange={event => setAcceptPrivacy(event.target.checked)} required className="mt-1" /><span>Confirmo que leí la <Link href="/privacy" target="_blank" className="font-semibold underline">política de privacidad</Link>.</span></label>
                        </div>
                        <button type="submit" disabled={submitting || !approveDraft || !acceptTerms || !acceptPrivacy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-semibold text-white disabled:opacity-50">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            {submitting ? "Creando comunidad…" : "Aprobar y crear comunidad"}
                            {!submitting && <ArrowRight className="h-4 w-4" />}
                        </button>
                    </form>
                )}
                <div className="flex items-center gap-2 text-xs cc-text-secondary"><User className="h-4 w-4" /> Tras confirmar tu correo, CoCo te acompañará en la carga de la nómina.</div>
            </div>
        </main>
    );
}
