"use client";

import { useState, useRef, useEffect, type ClipboardEvent, type DragEvent } from "react";
import Image from "next/image";
import { Bot, Send, Sparkles, Calendar, DollarSign, Loader2, ArrowRight, ShieldCheck, Check, XCircle, MessageCircle, Paperclip, X, Plus, PanelLeft, ShoppingCart, Wrench, Store, FileText, ImageIcon, Upload } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getApiUrl } from "@/lib/config";
import confetti from "canvas-confetti";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DisplayHeading } from "@/components/cc/Eyebrow";
import { useRouter } from "next/navigation";
import { COCO_NAV_MAP, getSafeCoCoNavigation } from "@/lib/coco/navigation";
import { CoCoMarkdownLink } from "@/components/CoCo/CoCoMarkdownLink";
import { CoCoThreadSidebar } from "@/components/CoCo/CoCoThreadSidebar";
import type { CoCoApiResponse, CoCoChatMessage, CoCoPendingAction, CoCoThread, CocoConsentState, PrivacyConsentsResponse, WhatsAppStartStatus } from "@/lib/types";
import { CommunityDocumentsService } from "@/lib/api";
import { COCO_PRIVACY_NOTICE, PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import { CHAT_FILE_ACCEPT, MAX_CHAT_ATTACHMENTS, MAX_CHAT_DOCUMENT_BYTES, MAX_CHAT_IMAGE_BYTES, addChatAttachments, attachmentSummary, formatBytes, imageDataUrlBudget, type ChatAttachmentDraft, type CoCoDocumentRead } from "@/lib/coco/chatAttachmentRules";
import { prepareChatImage } from "@/lib/coco/prepareChatImage";
import { attachmentFailureFromError, type AttachmentFailure } from "@/lib/coco/attachmentFailures";

function CoCoMarkdown({ text, onAccent = false }: { text: string; onAccent?: boolean }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-extrabold">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal space-y-1 pl-4 text-sm leading-relaxed mb-2">{children}</ol>,
                a: ({ children, href }) => (
                    <CoCoMarkdownLink href={href} className={onAccent ? "font-bold underline" : "font-bold underline text-[var(--cc-copper-text)] hover:opacity-80 transition-opacity"}>
                        {children}
                    </CoCoMarkdownLink>
                ),
            }}
        >
            {text}
        </ReactMarkdown>
    );
}

const CHIPS = [
    { label: "¿Cómo reservo un espacio?", icon: Calendar },
    { label: "¿Cómo pago mis gastos?", icon: DollarSign },
    { label: "Muéstrame el tour", icon: Sparkles },
];

// Modo vecino (edificio sin administración en Convive) o vecino esperando
// validación: reservas y gastos no existen todavía. Los chips de arriba lo
// mandaban a un muro; estos llevan a lo que sí funciona.
const NEIGHBOR_CHIPS = [
    { label: "Compara precios de mi lista del súper", icon: ShoppingCart },
    { label: "Necesito un gasfiter de confianza", icon: Wrench },
    { label: "Quiero vender algo a mis vecinos", icon: Store },
];

const ADMIN_CHIPS = [
    { label: "Ayúdame a poner en marcha mi comunidad", icon: Sparkles },
    { label: "¿Qué falta para incorporar a los residentes?", icon: Bot },
    { label: "Revisemos los gastos comunes", icon: DollarSign },
];

const WELCOME_MESSAGE: CoCoChatMessage = {
    id: 'welcome', role: 'assistant',
    text: 'Hola. Soy **CoCo**, tu asistente de Convive Connect. ¿En qué te puedo ayudar?',
};

export default function CoCoChatPage() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const [msgs, setMsgs] = useState<CoCoChatMessage[]>([WELCOME_MESSAGE]);
    const [threads, setThreads] = useState<CoCoThread[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [threadsOpen, setThreadsOpen] = useState(false);
    // Navegación pedida por la última respuesta. Se cancela si la persona cambia
    // de conversación o sale del chat antes de que se cumpla.
    const pendingNavigation = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeThreadRef = useRef<string | null>(null);
    const cancelPendingNavigation = () => {
        if (pendingNavigation.current) clearTimeout(pendingNavigation.current);
        pendingNavigation.current = null;
    };
    useEffect(() => { activeThreadRef.current = activeThreadId; }, [activeThreadId]);
    useEffect(() => cancelPendingNavigation, []);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(true);
    // Adjuntos del próximo mensaje: hasta MAX_CHAT_ATTACHMENTS, imágenes y documentos mezclados.
    const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
    const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const dragDepth = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [whatsApp, setWhatsApp] = useState<WhatsAppStartStatus | null>(null);
    // Aviso de privacidad de CoCo: se muestra hasta que la persona lo lee y lo acepta.
    const [cocoConsent, setCocoConsent] = useState<CocoConsentState | null>(null);
    const [savingConsent, setSavingConsent] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const hasUnresolvedPending = msgs.some(message =>
        message.pendingActions?.some(action => !message.resolvedActions?.[action.toolUseId]),
    );

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs]);

    useEffect(() => {
        if (!user?.id) return;
        let active = true;
        setHistoryLoading(true);
        fetch('/api/coco/threads', { cache: 'no-store' })
            .then(response => response.ok ? response.json() as Promise<{ threads: CoCoThread[] }> : Promise.reject(new Error('No pude cargar las conversaciones.')))
            .then(async result => {
                let items = result.threads;
                if (!items.length) {
                    const created = await fetch('/api/coco/threads', { method: 'POST' });
                    if (!created.ok) throw new Error('No pude iniciar la conversación.');
                    const payload = await created.json() as { thread: CoCoThread };
                    items = [payload.thread];
                }
                if (!active) return;
                setThreads(items);
                setActiveThreadId(items[0].id);
                const response = await fetch(`/api/coco?threadId=${encodeURIComponent(items[0].id)}`, { cache: 'no-store' });
                if (!response.ok) throw new Error('No pude cargar el historial.');
                const history = await response.json() as { messages: CoCoChatMessage[] };
                if (active) setMsgs(history.messages.length ? history.messages : [WELCOME_MESSAGE]);
            })
            .catch(error => { if (active) setMsgs([{ ...WELCOME_MESSAGE, text: error instanceof Error ? error.message : 'No pude cargar el chat.' }]); })
            .finally(() => { if (active) setHistoryLoading(false); });
        return () => { active = false; };
    }, [user?.id]);

    async function selectThread(id: string) {
        if (loading || historyLoading || id === activeThreadId) return;
        cancelPendingNavigation();
        setHistoryLoading(true);
        setActiveThreadId(id);
        setThreadsOpen(false);
        setMsgs([WELCOME_MESSAGE]);
        setInput('');
        clearAttachments();
        try {
            const response = await fetch(`/api/coco?threadId=${encodeURIComponent(id)}`, { cache: 'no-store' });
            if (!response.ok) throw new Error('No pude cargar esta conversación.');
            const history = await response.json() as { messages: CoCoChatMessage[] };
            setMsgs(history.messages.length ? history.messages : [WELCOME_MESSAGE]);
        } catch (error) {
            setMsgs([{ ...WELCOME_MESSAGE, text: error instanceof Error ? error.message : 'No pude cargar esta conversación.' }]);
        } finally { setHistoryLoading(false); }
    }

    // Renombrar y fijar se mandan en serie: cada PATCH lee y reescribe la
    // metadata completa, y dos en paralelo podían pisarse.
    const metaQueue = useRef<Promise<unknown>>(Promise.resolve());
    const queueThreadPatch = (id: string, body: { title?: string; pinned?: boolean }) => {
        const run = metaQueue.current.then(() => fetch(`/api/coco/threads/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }).catch(() => null));
        metaQueue.current = run;
        return run;
    };

    async function renameThread(id: string, title: string) {
        const previous = threads;
        setThreads(current => current.map(thread => thread.id === id ? { ...thread, title } : thread));
        const response = await queueThreadPatch(id, { title });
        if (!response?.ok) setThreads(previous);
    }

    async function togglePinThread(id: string, pinned: boolean) {
        const previous = threads;
        setThreads(current => current.map(thread => thread.id === id ? { ...thread, pinned } : thread));
        const response = await queueThreadPatch(id, { pinned });
        if (!response?.ok) setThreads(previous);
    }

    async function deleteThread(id: string) {
        const thread = threads.find(item => item.id === id);
        if (!window.confirm(`¿Borrar "${thread?.title || 'esta conversación'}"? No se puede deshacer.`)) return;
        const wasActive = id === activeThreadId;
        // Sin conversación activa no se puede enviar: así nadie escribe en la que
        // se está borrando (un envío en paralelo la volvería a crear).
        if (wasActive) {
            cancelPendingNavigation();
            setActiveThreadId(null);
        }
        const response = await fetch(`/api/coco/threads/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
        if (!response?.ok) {
            if (wasActive) setActiveThreadId(id);
            return;
        }
        const remaining = threads.filter(item => item.id !== id);
        setThreads(remaining);
        if (!wasActive) return;
        const next = remaining.find(item => !item.empty) || remaining[0];
        if (next) await selectThread(next.id);
        else await createThread();
    }

    async function createThread() {
        if (loading || historyLoading) return;
        cancelPendingNavigation();
        setHistoryLoading(true);
        try {
            const response = await fetch('/api/coco/threads', { method: 'POST' });
            const payload = await response.json() as { thread?: CoCoThread; error?: string };
            if (!response.ok || !payload.thread) throw new Error(payload.error || 'No pude crear la conversación.');
            const thread = payload.thread;
            setThreads(current => current.some(item => item.id === thread.id) ? current : [thread, ...current]);
            setActiveThreadId(thread.id);
            setThreadsOpen(false);
            setMsgs([WELCOME_MESSAGE]);
            setInput('');
            clearAttachments();
        } catch (error) {
            setMsgs(current => [...current, { id: Date.now().toString(), role: 'assistant', text: error instanceof Error ? error.message : 'No pude crear la conversación.' }]);
        } finally { setHistoryLoading(false); }
    }

    useEffect(() => {
        if (!user) return;
        let active = true;
        fetch(getApiUrl('/api/whatsapp/start'), { cache: 'no-store' })
            .then(response => response.ok ? response.json() as Promise<WhatsAppStartStatus> : null)
            .then(status => { if (active) setWhatsApp(status); })
            .catch(() => { if (active) setWhatsApp(null); });
        return () => { active = false; };
    }, [user]);

    useEffect(() => {
        if (!user) return;
        let active = true;
        fetch(getApiUrl("/api/privacy/consents"), { cache: "no-store" })
            .then(response => response.ok ? response.json() as Promise<PrivacyConsentsResponse> : null)
            .then(data => { if (active) setCocoConsent(data?.cocoConsent ?? null); })
            .catch(() => { if (active) setCocoConsent(null); });
        return () => { active = false; };
    }, [user]);

    const decideCocoConsent = async (granted: boolean) => {
        setSavingConsent(true);
        try {
            const response = await fetch(getApiUrl("/api/privacy/consents"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ consentType: "ai_processing", granted, channel: "chat" }),
            });
            if (response.ok) setCocoConsent(granted ? "granted" : "withdrawn");
        } finally {
            setSavingConsent(false);
        }
    };

    const postToCoCo = async (body: Record<string, unknown>): Promise<CoCoApiResponse> => {
        const res = await fetch(getApiUrl("/api/coco"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPage: "/chat", threadId: activeThreadId, ...body }),
        });
        const data = await res.json().catch(() => ({})) as CoCoApiResponse;
        if (!res.ok) throw new Error(data.reply || `HTTP ${res.status}`);
        return data;
    };

    // La barra lateral se relee tras cada envío, también si falló: el servidor
    // ya guardó el mensaje y la conversación tiene título.
    const refreshThreads = () => {
        void fetch('/api/coco/threads', { cache: 'no-store' })
            .then(response => response.ok ? response.json() as Promise<{ threads: CoCoThread[] }> : null)
            .then(result => { if (result) setThreads(result.threads); })
            .catch(() => {});
    };

    const appendAssistantReply = (data: CoCoApiResponse) => {
        const safeNavigate = getSafeCoCoNavigation(data.navigate);
        setMsgs(previous => [...previous, {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            text: data.reply || (data.pendingActions?.length ? "" : "No pude responder."),
            nav: safeNavigate,
            action: data.action,
            pendingActions: data.pendingActions,
        }]);

        // La persona pidió ir ("llévame ahí"): se navega sin esperar el clic.
        if (safeNavigate && data.autoNavigate && !data.pendingActions?.length) {
            cancelPendingNavigation();
            const originThread = activeThreadRef.current;
            pendingNavigation.current = setTimeout(() => {
                pendingNavigation.current = null;
                if (activeThreadRef.current === originThread) router.push(safeNavigate);
            }, 900);
        }

        refreshThreads();

        if (!data.action) return;
        setTimeout(() => {
            switch (data.action) {
                case 'THEME_DARK':
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('theme', 'dark');
                    break;
                case 'THEME_LIGHT':
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('theme', 'light');
                    break;
                case 'LOGOUT':
                    logout();
                    router.push('/');
                    break;
                case 'CONFETTI':
                    confetti({ zIndex: 99999, particleCount: 150, spread: 80 });
                    break;
                case 'SCROLL_TOP':
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    break;
                case 'TEXT_ENLARGE':
                    document.documentElement.style.fontSize = '125%';
                    break;
                case 'TEXT_NORMAL':
                    document.documentElement.style.fontSize = '';
                    break;
                case 'READ_ALOUD':
                    if ('speechSynthesis' in window && data.reply) {
                        window.speechSynthesis.cancel();
                        const utterance = new SpeechSynthesisUtterance(data.reply.replace(/\*\*/g, '').replace(/\[.*\]\(.*\)/g, ''));
                        utterance.lang = 'es-CL';
                        utterance.rate = 1.05;
                        window.speechSynthesis.speak(utterance);
                    }
                    break;
            }
        }, 500);
    };

    function clearAttachments() {
        setAttachments([]);
        setAttachmentNotice(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    function addFiles(files: File[]) {
        if (!files.length) return;
        const result = addChatAttachments(attachments, files, () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        setAttachments(result.attachments);
        setAttachmentNotice(result.rejected.length ? result.rejected.join(' ') : null);
    }

    function removeAttachment(id: string) {
        setAttachments(current => current.filter(item => item.id !== id));
        setAttachmentNotice(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    const acceptsFiles = !hasUnresolvedPending;
    const hasDraggedFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files');
    const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
        if (!acceptsFiles || !hasDraggedFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
    };
    const onDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (!acceptsFiles || !hasDraggedFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
        if (!hasDraggedFiles(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragActive(false);
        if (acceptsFiles) addFiles(Array.from(event.dataTransfer.files || []));
    };
    // Pegar una captura o un archivo copiado. Si hay texto, se pega normal.
    const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
        if (!acceptsFiles) return;
        const files = Array.from(event.clipboardData?.files || []);
        // Celdas de Excel o texto de Word traen además una imagen: ahí manda el texto.
        if (!files.length || event.clipboardData.getData('text/plain').trim()) return;
        event.preventDefault();
        addFiles(files.map((file, index) => file.name && file.name !== 'image.png'
            ? file
            : new File([file], `pegado-${Date.now()}-${index + 1}.${(file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: file.type })));
    };

    const send = async (text: string) => {
        if ((!text.trim() && !attachments.length) || loading || historyLoading || !activeThreadId || hasUnresolvedPending) return;

        if (attachments.length) {
            const files = attachments;
            const documents = files.filter(item => item.kind === 'document');
            const imageFiles = files.filter(item => item.kind === 'image');
            const question = text.trim() || (documents.length
                ? `Analiza ${files.length > 1 ? 'estos archivos' : 'este documento'} y dime qué establece${files.length > 1 ? 'n' : ''}, qué falta y qué debo revisar.`
                : `Mira ${imageFiles.length > 1 ? 'estas imágenes' : 'esta imagen'} y dime qué observas y qué debería revisar.`);
            const preview = imageFiles[0] ? await prepareChatImage(imageFiles[0].file, 400_000).catch(() => undefined) : undefined;
            setMsgs(previous => [...previous, {
                id: Date.now().toString(), role: 'user',
                text: `${question}\n${attachmentSummary(files.map(item => item.file.name))}`,
                ...(preview ? { imageBase64: preview } : {}),
            }]);
            setInput('');
            clearAttachments();
            setLoading(true);
            try {
                const budget = imageDataUrlBudget(imageFiles.length);
                // Los documentos suben directo al almacenamiento y el servidor los
                // lee completos (escaneos incluidos), en paralelo. Las imágenes se
                // achican aquí para que varias quepan en el mismo mensaje.
                const [documentResults, imageResults] = await Promise.all([
                    Promise.allSettled(documents.map(item => CommunityDocumentsService.readForCoCo(item.file))),
                    Promise.allSettled(imageFiles.map(item => prepareChatImage(item.file, budget))),
                ]);
                // Cada adjunto que falló llega al modelo con su causa (reason_code de
                // una lista cerrada y el texto literal), para que no suponga otra.
                const attachmentErrors: AttachmentFailure[] = [
                    ...documentResults.flatMap((result, index) => result.status === 'rejected' ? [attachmentFailureFromError(documents[index].file.name, result.reason, 'upload_failed')] : []),
                    ...imageResults.flatMap((result, index) => result.status === 'rejected'
                        ? [attachmentFailureFromError(imageFiles[index].file.name, result.reason, /pesad|grande/i.test(String((result.reason as Error | undefined)?.message || '')) ? 'too_large' : 'unsupported_type')]
                        : []),
                ];
                const legalDocuments = documentResults.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
                    .map((document: CoCoDocumentRead) => ({
                        name: document.name, text: document.text, pageImages: [],
                        pageCount: document.pageCount, truncated: document.truncated,
                        documentId: document.documentId, visualPdfPath: document.visualPdfPath,
                    }));
                const images = imageResults.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
                if (attachmentErrors.length) {
                    setMsgs(previous => [...previous, { id: `${Date.now()}-fail`, role: 'assistant', text: `No pude usar ${attachmentErrors.length === 1 ? 'un archivo' : `${attachmentErrors.length} archivos`}:\n${attachmentErrors.map(item => `- ${item.file}: ${item.reason_text}`).join('\n')}` }]);
                }
                // Aunque fallen todos, el mensaje se envía: así queda guardado en la
                // conversación y CoCo explica la causa real de cada archivo.
                appendAssistantReply(await postToCoCo({
                    message: question.slice(0, 1000),
                    attachmentNames: files.map(item => item.file.name),
                    ...(legalDocuments.length ? { legalDocuments } : {}),
                    ...(images.length ? { images } : {}),
                    ...(attachmentErrors.length ? { attachmentErrors } : {}),
                }));
            } catch (error) {
                setMsgs(previous => [...previous, { id: (Date.now() + 1).toString(), role: 'assistant', text: error instanceof Error ? error.message : 'No pude analizar los archivos.' }]);
                refreshThreads();
            } finally { setLoading(false); }
            return;
        }

        setMsgs(p => [...p, { id: Date.now().toString(), role: "user", text }]);
        setInput("");
        setLoading(true);

        try {
            appendAssistantReply(await postToCoCo({ message: text }));
        } catch (err: unknown) {
            console.error("CoCo error:", err);
            const error = err instanceof Error ? err.message : 'Error desconocido';
            setMsgs(p => [...p, {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                text: `${error} Inténtalo de nuevo.`
            }]);
            refreshThreads();
        } finally {
            setLoading(false);
        }
    };

    const resolveAction = async (
        messageId: string,
        pendingActions: CoCoPendingAction[],
        toolUseId: string,
        decision: "approved" | "rejected",
    ) => {
        if (loading) return;
        const resolutions: Record<string, "approved" | "rejected"> = Object.fromEntries(
            pendingActions.map(action => [
                action.toolUseId,
                action.toolUseId === toolUseId ? decision : "rejected",
            ]),
        );
        setMsgs(previous => previous.map(message => message.id === messageId
            ? { ...message, resolvedActions: resolutions }
            : message));
        setLoading(true);
        try {
            appendAssistantReply(await postToCoCo({ resolutions }));
        } catch (err: unknown) {
            setMsgs(previous => previous.map(message => message.id === messageId
                ? { ...message, resolvedActions: undefined }
                : message));
            const error = err instanceof Error ? err.message : 'No se pudo resolver la acción.';
            setMsgs(previous => [...previous, {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                text: `${error} Inténtalo de nuevo.`,
            }]);
        } finally {
            setLoading(false);
        }
    };

    // /chat?q=…: el inicio abre CoCo con una pregunta lista. Se envía una sola
    // vez, cuando el hilo terminó de cargar, y se limpia de la URL para que
    // recargar no la repita.
    const pendingQuestionRef = useRef<string | null>(null);
    useEffect(() => {
        const question = new URLSearchParams(window.location.search).get('q')?.trim().slice(0, 300);
        if (question) pendingQuestionRef.current = question;
    }, []);
    useEffect(() => {
        const question = pendingQuestionRef.current;
        if (!question || historyLoading || loading || !activeThreadId) return;
        pendingQuestionRef.current = null;
        window.history.replaceState(null, '', '/chat');
        void send(question);
        // send cambia en cada render; el envío depende solo de que el hilo esté listo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historyLoading, loading, activeThreadId]);

    const firstName = user?.name ? user.name.split(" ")[0] : "vecino/a";
    const neighborMode = user?.role === 'resident' && (user.communityManaged === false || user.residenceVerified === false);
    const chips = user?.role === 'admin' ? ADMIN_CHIPS : neighborMode ? NEIGHBOR_CHIPS : CHIPS;

    // Colores: tokens --cc-* para seguir el tema de la app (claro u oscuro).
    // Nunca bg-white con texto var(--cc-ink): en .dark ese texto es claro.
    const muted = "text-[var(--cc-ink-muted)]";
    const subtle = "text-[var(--cc-ink-tertiary)]";
    const surface = "bg-[var(--cc-paper)] border border-[var(--cc-line-strong)]";

    return (
        <div
            className="relative flex w-full min-h-[calc(100vh-4rem)] bg-[var(--cc-ivory)] text-[var(--cc-ink)]"
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onPaste={onPaste}
        >
            {dragActive && (
                <div className="pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-[var(--cc-copper)] bg-[var(--cc-paper)]/90 text-[var(--cc-ink)] backdrop-blur-sm" role="status" aria-live="polite">
                    <Upload className="h-10 w-10 text-[var(--cc-copper-text)]" />
                    <p className="text-lg font-semibold">Suelta los archivos aquí</p>
                    <p className={`text-xs ${muted}`}>Hasta {MAX_CHAT_ATTACHMENTS} archivos: PDF, Word, Excel, CSV, TXT o imágenes</p>
                </div>
            )}
            <aside className="hidden w-72 shrink-0 border-r border-[var(--cc-line-strong)] bg-[var(--cc-paper)] lg:block">
                <div className="sticky top-0 h-[calc(100vh-4rem)]">
                    <CoCoThreadSidebar
                        threads={threads}
                        activeId={activeThreadId}
                        disabled={loading || historyLoading}
                        onSelect={id => void selectThread(id)}
                        onCreate={() => void createThread()}
                        onRename={(id, title) => void renameThread(id, title)}
                        onTogglePin={(id, pinned) => void togglePinThread(id, pinned)}
                        onDelete={id => void deleteThread(id)}
                    />
                </div>
            </aside>
            {threadsOpen && (
                <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Conversaciones">
                    <div className="h-full w-80 max-w-[85vw] border-r border-[var(--cc-line-strong)] bg-[var(--cc-paper)] text-[var(--cc-ink)]">
                        <div className="flex justify-end px-3 pt-3">
                            <button type="button" onClick={() => setThreadsOpen(false)} aria-label="Cerrar conversaciones" className={`rounded-lg p-2 ${muted} hover:bg-[var(--cc-copper-tint)] hover:text-[var(--cc-ink)]`}><X className="h-4 w-4" /></button>
                        </div>
                        <div className="h-[calc(100%-3.5rem)]">
                            <CoCoThreadSidebar
                        threads={threads}
                        activeId={activeThreadId}
                        disabled={loading || historyLoading}
                        onSelect={id => void selectThread(id)}
                        onCreate={() => void createThread()}
                        onRename={(id, title) => void renameThread(id, title)}
                        onTogglePin={(id, pinned) => void togglePinThread(id, pinned)}
                        onDelete={id => void deleteThread(id)}
                            />
                        </div>
                    </div>
                    <button type="button" className="flex-1 bg-black/50" aria-label="Cerrar conversaciones" onClick={() => setThreadsOpen(false)} />
                </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="flex items-center gap-2 border-b border-[var(--cc-line-strong)] px-4 py-2.5 lg:hidden">
                <button type="button" onClick={() => setThreadsOpen(true)} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold ${muted} hover:bg-[var(--cc-copper-tint)]`}>
                    <PanelLeft className="h-4 w-4" /> Conversaciones
                </button>
                <span className={`min-w-0 flex-1 truncate text-xs ${subtle}`}>
                    {threads.find(thread => thread.id === activeThreadId)?.title || ''}
                </span>
                <button type="button" onClick={() => void createThread()} disabled={loading || historyLoading} aria-label="Nueva conversación" className="rounded-lg p-2 text-[var(--cc-copper-text)] hover:bg-[var(--cc-copper-tint)] disabled:opacity-40">
                    <Plus className="h-4 w-4" />
                </button>
            </div>
            {/* Main Chat Flow Container */}
            <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:px-6 flex flex-col justify-between">
                
                {/* Hero Greeting when chat is empty or just welcome message */}
                {msgs.length <= 1 ? (
                    <div className="py-12 text-center space-y-4 my-auto">
                        <div className={`inline-flex p-3 rounded-2xl text-[var(--cc-copper-text)] mb-2 ${surface}`}>
                            <Bot className="h-10 w-10" />
                        </div>
                        <DisplayHeading size={42} style={{ color: "var(--cc-ink)" }}>
                            ¿En qué te <em className="text-italic-serif text-[var(--cc-copper-text)]">ayudo</em> hoy, {firstName}?
                        </DisplayHeading>
                        <p className={`text-sm max-w-md mx-auto ${muted}`}>
                            {user?.role === 'admin'
                                ? `Conversemos sobre ${user.communityName || 'tu comunidad'}. Puedo revisar lo que falta, ayudarte a operar y pedirte aprobación antes de aplicar cambios.`
                                : 'Puedes pedirme reportar una filtración, agendar un quincho, revisar tu cobro de gastos comunes o consultar reglamentos.'}
                        </p>
                        <p className={`text-xs ${subtle}`}>Puedes arrastrar o pegar hasta {MAX_CHAT_ATTACHMENTS} archivos a la vez.</p>
                    </div>
                ) : (
                    /* Messages Flow */
                    <div className="space-y-6 py-4 flex-1 overflow-y-auto max-h-[calc(100vh-18rem)] pr-2">
                        {msgs.map((msg) => {
                            const isAssistant = msg.role === "assistant";
                            return (
                                <div key={msg.id} className={`flex gap-4 ${isAssistant ? "justify-start" : "justify-end animate-fade-in"}`}>
                                    {isAssistant && (
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 ${surface}`}>
                                            <Bot className="h-5 w-5 text-[var(--cc-copper-text)]" />
                                        </div>
                                    )}
                                    <div className="flex flex-col gap-2 max-w-[80%] min-w-0">
                                        {msg.imageBase64 && <Image src={msg.imageBase64} alt="Imagen adjunta" width={240} height={180} unoptimized className="max-h-48 w-auto max-w-full rounded-xl object-contain" />}
                                        {msg.text && <div
                                            className={`px-4 py-3.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
                                                isAssistant 
                                                    ? `${surface} text-[var(--cc-ink)] shadow-sm`
                                                    : "bg-[var(--cc-copper)] text-white shadow-md"
                                            }`}
                                        >
                                            <CoCoMarkdown text={msg.text} onAccent={!isAssistant} />
                                        </div>}
                                        {isAssistant && msg.pendingActions?.map(pending => {
                                            const decision = msg.resolvedActions?.[pending.toolUseId];
                                            return (
                                                <div key={pending.toolUseId} className="rounded-xl border border-[var(--cc-amber)] bg-[var(--cc-amber-tint)] p-3.5 text-[var(--cc-ink)]">
                                                    <div className="flex items-start gap-2.5">
                                                        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--cc-copper-text)]" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-black">{pending.title}</p>
                                                            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{pending.summary}</p>
                                                            {pending.previewUrl && (
                                                                // eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal de Storage
                                                                <img src={pending.previewUrl} alt="Imagen que se va a guardar" className="mt-2 max-h-48 rounded-lg object-contain" />
                                                            )}
                                                            {Object.entries(pending.input).filter(([, value]) => value !== undefined && value !== null && value !== "").length > 0 && (
                                                                <dl className="mt-2 space-y-0.5 rounded-lg bg-[var(--cc-paper)] p-2">
                                                                    {Object.entries(pending.input)
                                                                        .filter(([, value]) => value !== undefined && value !== null && value !== "")
                                                                        .map(([key, value]) => (
                                                                            <div key={key} className="flex gap-1.5 text-[11px] leading-snug">
                                                                                <dt className={`shrink-0 font-mono uppercase tracking-wide ${subtle}`}>{key.replace(/_/g, " ")}:</dt>
                                                                                <dd className="min-w-0 break-words font-mono text-[var(--cc-ink)]">{typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}</dd>
                                                                            </div>
                                                                        ))}
                                                                </dl>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {!decision ? (
                                                        <div className="mt-3 flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => resolveAction(msg.id, msg.pendingActions || [], pending.toolUseId, "approved")}
                                                                disabled={loading}
                                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--cc-ink)] px-3 py-2 text-xs font-bold text-[var(--cc-paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
                                                            >
                                                                <Check className="h-3.5 w-3.5" /> {(msg.pendingActions?.length || 0) > 1 ? "Aprobar solo esta" : "Aprobar"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => resolveAction(msg.id, msg.pendingActions || [], pending.toolUseId, "rejected")}
                                                                disabled={loading}
                                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--cc-line-strong)] bg-[var(--cc-paper)] px-3 py-2 text-xs font-bold text-[var(--cc-ink)] transition-colors hover:bg-[var(--cc-ivory-soft)] disabled:opacity-50"
                                                            >
                                                                <XCircle className="h-3.5 w-3.5" /> Rechazar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <p className="mt-2.5 text-xs font-bold text-[var(--cc-copper-text)]">
                                                            {decision === "approved" ? "✓ Aprobado" : "✕ Rechazado"}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {msg.nav && (
                                            <div className="mt-1 flex justify-start">
                                                <a 
                                                    href={msg.nav}
                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cc-copper-text)] hover:opacity-80 transition-opacity"
                                                >
                                                    Ir a {COCO_NAV_MAP[msg.nav] || 'la sección'} <ArrowRight className="h-3 w-3" />
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                    {!isAssistant && (
                                        <div className="w-9 h-9 rounded-xl bg-[var(--cc-copper-tint)] text-[var(--cc-copper-text)] border border-[var(--cc-line-strong)] flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1">
                                            {user?.name?.charAt(0).toUpperCase() || "U"}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {loading && (
                            <div className="flex gap-4 justify-start">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${surface}`}>
                                    <Bot className="h-5 w-5 text-[var(--cc-copper-text)]" />
                                </div>
                                <div className={`rounded-2xl px-5 py-4 flex gap-1.5 items-center ${surface}`}>
                                    {[0, 150, 300].map(d => (
                                        <span key={d} className="w-2 h-2 bg-[var(--cc-copper)] rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>
                )}

                {/* Suggestion Chips & Input bar */}
                <div className="space-y-4 border-t border-[var(--cc-line-strong)] pt-6 bg-[var(--cc-ivory)]">
                    {cocoConsent === "unknown" && (
                        <section aria-label={COCO_PRIVACY_NOTICE.title} className={`rounded-2xl px-5 py-4 text-sm ${surface} ${muted}`}>
                            <p className="flex items-center gap-2 font-semibold text-[var(--cc-ink)]"><ShieldCheck className="h-4 w-4 text-[var(--cc-sage-text)]" /> {COCO_PRIVACY_NOTICE.title}</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                                {COCO_PRIVACY_NOTICE.points.map(point => <li key={point}>{point}</li>)}
                            </ul>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <button type="button" disabled={savingConsent} onClick={() => void decideCocoConsent(true)} className="min-h-11 rounded-full bg-[var(--cc-ink)] px-4 text-sm font-semibold text-[var(--cc-paper)] hover:opacity-90 disabled:opacity-60">{COCO_PRIVACY_NOTICE.accept}</button>
                                <a href="/privacy" className={`text-xs underline ${subtle}`}>Política de privacidad, versión {PRIVACY_POLICY_VERSION}</a>
                            </div>
                        </section>
                    )}
                    {whatsApp?.available && (
                        <div className="text-center">
                            <a href={whatsApp.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--cc-line-strong)] bg-[var(--cc-sage-tint)] px-5 py-2.5 text-sm font-semibold text-[var(--cc-sage-text)] transition-opacity hover:opacity-90">
                                <MessageCircle className="h-4 w-4" /> Hablar con CoCo por WhatsApp
                            </a>
                        </div>
                    )}
                    {whatsApp && !whatsApp.available && whatsApp.reason !== 'unconfigured' && (
                        <p className={`text-center text-xs ${muted}`}>
                            {whatsApp.reason === 'consent' ? 'Para usar WhatsApp, actívalo en el' : 'Para usar WhatsApp, agrega tu teléfono chileno en tu'}{' '}
                            <a href={whatsApp.reason === 'consent' ? '/privacy-center' : '/profile'} className="font-semibold text-[var(--cc-sage-text)] underline">
                                {whatsApp.reason === 'consent' ? 'Centro de privacidad' : 'perfil'}
                            </a>.
                        </p>
                    )}
                    {/* Suggestion Chips */}
                    {msgs.length <= 2 && (
                        <div className="flex flex-wrap gap-2 justify-center">
                            {chips.map(chip => {
                                const Icon = chip.icon;
                                return (
                                    <button
                                        key={chip.label}
                                        onClick={() => send(chip.label)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold ${surface} ${muted} hover:text-[var(--cc-ink)] hover:border-[var(--cc-copper)] transition-colors`}
                                    >
                                        <Icon className="h-3.5 w-3.5 text-[var(--cc-copper-text)]" />
                                        {chip.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {attachments.length > 0 && (
                        <ul aria-label="Archivos adjuntos" className="mx-auto flex max-w-3xl flex-wrap gap-2">
                            {attachments.map(item => (
                                <li key={item.id} className={`flex max-w-full items-center gap-2 rounded-xl py-1.5 pl-3 pr-1.5 text-xs ${surface}`}>
                                    {item.kind === 'image'
                                        ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-[var(--cc-copper-text)]" />
                                        : <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--cc-copper-text)]" />}
                                    <span className="max-w-[14rem] truncate font-medium text-[var(--cc-ink)]" title={item.file.name}>{item.file.name}</span>
                                    <span className={`shrink-0 ${subtle}`}>{formatBytes(item.file.size)}</span>
                                    <button type="button" onClick={() => removeAttachment(item.id)} aria-label={`Quitar ${item.file.name}`} className={`rounded-full p-1 ${muted} hover:bg-[var(--cc-copper-tint)] hover:text-[var(--cc-ink)]`}>
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </li>
                            ))}
                            <li className={`self-center text-[11px] ${subtle}`}>{attachments.length}/{MAX_CHAT_ATTACHMENTS}</li>
                        </ul>
                    )}
                    {attachmentNotice && (
                        <p role="alert" className="mx-auto max-w-3xl text-xs text-[var(--cc-rose-text)]">{attachmentNotice}</p>
                    )}
                    {/* Input Bar: rounded pill with send button in copper */}
                    <form 
                        onSubmit={(e) => { e.preventDefault(); send(input); }}
                        className="relative flex items-center max-w-3xl w-full mx-auto"
                    >
                        <input ref={fileInputRef} type="file" multiple accept={CHAT_FILE_ACCEPT} className="hidden" onChange={event => {
                            addFiles(Array.from(event.target.files || []));
                            event.target.value = '';
                        }} />
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || historyLoading || hasUnresolvedPending || attachments.length >= MAX_CHAT_ATTACHMENTS} aria-label="Adjuntar archivos" title={`Adjunta hasta ${MAX_CHAT_ATTACHMENTS} archivos: documentos de hasta ${formatBytes(MAX_CHAT_DOCUMENT_BYTES)} e imágenes de hasta ${formatBytes(MAX_CHAT_IMAGE_BYTES)}`} className={`absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full ${muted} hover:bg-[var(--cc-copper-tint)] hover:text-[var(--cc-ink)] disabled:opacity-40`}>
                            <Paperclip className="h-4 w-4" />
                        </button>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={hasUnresolvedPending ? "Aprueba o rechaza la acción pendiente" : "Pregúntale a CoCo..."}
                            disabled={loading || historyLoading || hasUnresolvedPending}
                            className="w-full h-14 pl-14 pr-16 rounded-full bg-[var(--cc-paper)] border border-[var(--cc-line-strong)] text-[var(--cc-ink)] placeholder:text-[var(--cc-ink-tertiary)] text-sm font-medium outline-none shadow-sm transition-all focus:border-[var(--cc-copper)] focus:ring-1 focus:ring-[var(--cc-copper)]"
                        />
                        <button
                            type="submit"
                            aria-label="Enviar"
                            disabled={loading || historyLoading || hasUnresolvedPending || (!input.trim() && !attachments.length)}
                            className="absolute right-2 h-10 w-10 rounded-full bg-[var(--cc-copper)] text-white flex items-center justify-center hover:bg-[var(--cc-copper-deep)] transition-colors disabled:opacity-40 shadow-md"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                    </form>
                </div>

            </div>
            </div>
        </div>
    );
}
