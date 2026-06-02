"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ArrowRight,
    CheckCircle2,
    Clipboard,
    HandCoins,
    HeartHandshake,
    Leaf,
    MessageSquareHeart,
    PackageCheck,
    Plus,
    Send,
    ShoppingBasket,
    Users,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { CommunityCollaborationService } from "@/lib/api";
import {
    CollectivePurchaseCampaign,
    CommunityProject,
    NeighborMediationCase,
    TimeBankOffer,
} from "@/lib/types";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";

type ActiveLane = "mediation" | "timebank" | "abasto" | "projects";

const LANES: Array<{ id: ActiveLane; label: string; icon: typeof HeartHandshake }> = [
    { id: "mediation", label: "Mediacion CNV", icon: MessageSquareHeart },
    { id: "timebank", label: "Banco de tiempo", icon: HandCoins },
    { id: "abasto", label: "Abasto comunitario", icon: ShoppingBasket },
    { id: "projects", label: "Plaza social", icon: Leaf },
];

const cnvFeelings = ["frustrado/a", "cansado/a", "preocupado/a", "sobrepasado/a", "intranquilo/a"];
const timeBankCategories: TimeBankOffer["category"][] = ["tools", "care", "digital", "home", "learning", "other"];
const purchaseCategories: CollectivePurchaseCampaign["category"][] = ["water", "gas", "cleaning", "food", "eco", "other"];
const projectAreas: CommunityProject["area"][] = ["huerto", "reciclaje", "cuidados", "mascotas", "cultura", "otro"];

function currency(value: number) {
    return `$${value.toLocaleString("es-CL")}`;
}

function todayPlus(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

function labelFromSlug(value: string) {
    const labels: Record<string, string> = {
        tools: "Herramientas",
        care: "Cuidados",
        digital: "Digital",
        home: "Hogar",
        learning: "Aprendizaje",
        water: "Agua",
        gas: "Gas",
        cleaning: "Limpieza",
        food: "Alimentos",
        eco: "Ecologico",
        huerto: "Huerto",
        reciclaje: "Reciclaje",
        cuidados: "Cuidados",
        mascotas: "Mascotas",
        cultura: "Cultura",
        other: "Otro",
        otro: "Otro",
    };
    return labels[value] || value;
}

export default function ConvivenciaPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [activeLane, setActiveLane] = useState<ActiveLane>("mediation");
    const [mediations, setMediations] = useState<NeighborMediationCase[]>([]);
    const [timeBankOffers, setTimeBankOffers] = useState<TimeBankOffer[]>([]);
    const [purchases, setPurchases] = useState<CollectivePurchaseCampaign[]>([]);
    const [projects, setProjects] = useState<CommunityProject[]>([]);

    const [mediationForm, setMediationForm] = useState({
        targetUnit: "",
        observation: "Hay musica alta a las 2:00 AM",
        feeling: "frustrado/a",
        need: "descansar porque manana trabajo temprano",
        request: "bajar el volumen durante la noche",
    });
    const [lastDraft, setLastDraft] = useState<NeighborMediationCase | null>(null);

    const [timeBankForm, setTimeBankForm] = useState({
        skill: "",
        description: "",
        availability: "",
        category: "tools" as TimeBankOffer["category"],
        credits: 1,
    });

    const [purchaseForm, setPurchaseForm] = useState({
        title: "",
        supplier: "",
        category: "water" as CollectivePurchaseCampaign["category"],
        unitPrice: 0,
        retailPrice: 0,
        minimumParticipants: 10,
        deadline: todayPlus(10),
    });

    const [projectForm, setProjectForm] = useState({
        title: "",
        area: "huerto" as CommunityProject["area"],
        description: "",
        impact: "",
        needed: "",
        cocoInsight: "",
    });

    useEffect(() => {
        async function load() {
            const [mediationData, timeBankData, purchaseData, projectData] = await Promise.all([
                CommunityCollaborationService.getMediationCases(),
                CommunityCollaborationService.getTimeBankOffers(),
                CommunityCollaborationService.getCollectivePurchases(),
                CommunityCollaborationService.getCommunityProjects(),
            ]);
            setMediations(mediationData);
            setTimeBankOffers(timeBankData);
            setPurchases(purchaseData);
            setProjects(projectData);
        }
        load();
    }, []);

    const communityCredits = useMemo(
        () => timeBankOffers.reduce((sum, item) => sum + item.credits + item.requestsCount, 0),
        [timeBankOffers]
    );

    const collectiveSavings = useMemo(
        () => purchases.reduce((sum, item) => sum + Math.max(0, item.retailPrice - item.unitPrice) * item.participants, 0),
        [purchases]
    );

    const handleCreateMediation = async (event: React.FormEvent) => {
        event.preventDefault();
        const draft = await CommunityCollaborationService.createMediationCase({
            reporterId: user?.id || "anonymous",
            reporterName: user?.name || "Vecino",
            communityId: user?.communityId,
            targetUnit: mediationForm.targetUnit || "Unidad por confirmar",
            observation: mediationForm.observation,
            feeling: mediationForm.feeling,
            need: mediationForm.need,
            request: mediationForm.request,
        });
        setLastDraft(draft);
        setMediations([draft, ...mediations]);
        toast({ title: "Mensaje CNV preparado", description: "CoCo redacto una peticion privada sin tono punitivo.", variant: "success" });
    };

    const updateMediation = async (id: string, status: NeighborMediationCase["status"]) => {
        const updated = await CommunityCollaborationService.updateMediationStatus(id, status);
        setMediations(updated);
        toast({ title: status === "sent" ? "Mensaje enviado" : "Estado actualizado", description: "El caso quedo registrado en mediacion activa.", variant: "success" });
    };

    const copyDraft = async () => {
        if (!lastDraft) return;
        await navigator.clipboard.writeText(lastDraft.draftedMessage);
        toast({ title: "Copiado", description: "El mensaje empatico esta listo para enviarse.", variant: "success" });
    };

    const handleCreateTimeBankOffer = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!timeBankForm.skill.trim() || !timeBankForm.description.trim()) return;
        const updated = await CommunityCollaborationService.createTimeBankOffer({
            profileId: user?.id,
            communityId: user?.communityId,
            neighborName: user?.name || "Vecino",
            unitLabel: user?.unitName || user?.unitId || "Depto",
            skill: timeBankForm.skill.trim(),
            description: timeBankForm.description.trim(),
            availability: timeBankForm.availability.trim() || "Coordinar por chat interno",
            category: timeBankForm.category,
            credits: Number(timeBankForm.credits) || 1,
        });
        setTimeBankOffers(updated);
        setTimeBankForm({ skill: "", description: "", availability: "", category: "tools", credits: 1 });
        toast({ title: "Oferta publicada", description: "Tu apoyo quedo visible en el banco de tiempo.", variant: "success" });
    };

    const requestOffer = async (id: string) => {
        const updated = await CommunityCollaborationService.requestTimeBankOffer(id);
        setTimeBankOffers(updated);
        toast({ title: "Solicitud registrada", description: "CoCo recomienda coordinar por mensaje interno antes de confirmar.", variant: "success" });
    };

    const handleCreatePurchase = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!purchaseForm.title.trim() || !purchaseForm.supplier.trim()) return;
        const updated = await CommunityCollaborationService.createCollectivePurchase({
            communityId: user?.communityId,
            title: purchaseForm.title.trim(),
            supplier: purchaseForm.supplier.trim(),
            category: purchaseForm.category,
            unitPrice: Number(purchaseForm.unitPrice) || 0,
            retailPrice: Number(purchaseForm.retailPrice) || 0,
            minimumParticipants: Number(purchaseForm.minimumParticipants) || 1,
            deadline: purchaseForm.deadline,
            organizer: user?.name || "Comite vecinal",
        });
        setPurchases(updated);
        setPurchaseForm({ title: "", supplier: "", category: "water", unitPrice: 0, retailPrice: 0, minimumParticipants: 10, deadline: todayPlus(10) });
        toast({ title: "Compra colectiva abierta", description: "La campana ya puede sumar unidades interesadas.", variant: "success" });
    };

    const joinPurchase = async (id: string) => {
        const updated = await CommunityCollaborationService.joinCollectivePurchase(id);
        setPurchases(updated);
        toast({ title: "Te sumaste al abasto", description: "Tu unidad cuenta para llegar al minimo mayorista.", variant: "success" });
    };

    const handleCreateProject = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!projectForm.title.trim() || !projectForm.description.trim()) return;
        const updated = await CommunityCollaborationService.createCommunityProject({
            communityId: user?.communityId,
            title: projectForm.title.trim(),
            area: projectForm.area,
            description: projectForm.description.trim(),
            impact: projectForm.impact.trim() || "Impacto por medir con vecinos inscritos.",
            needed: projectForm.needed.trim() || "Voluntarios y primer acuerdo de coordinacion.",
            cocoInsight: projectForm.cocoInsight.trim() || "CoCo puede detectar vecinos con intereses similares y sugerir el primer grupo de trabajo.",
        });
        setProjects(updated);
        setProjectForm({ title: "", area: "huerto", description: "", impact: "", needed: "", cocoInsight: "" });
        toast({ title: "Proyecto creado", description: "La plaza social ahora muestra esta iniciativa colectiva.", variant: "success" });
    };

    const joinProject = async (id: string) => {
        const updated = await CommunityCollaborationService.joinCommunityProject(id);
        setProjects(updated);
        toast({ title: "Participacion registrada", description: "CoCo sumo tu interes al proyecto comunitario.", variant: "success" });
    };

    return (
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-5">
                    <Eyebrow>Convivencia activa</Eyebrow>
                    <DisplayHeading size={44}>
                        Tu edificio como <em className="text-italic-serif text-brand-600">red de apoyo</em>.
                    </DisplayHeading>
                    <p className="max-w-3xl text-sm leading-7 cc-text-secondary">
                        Convive transforma conflictos, habilidades, compras y proyectos en coordinacion concreta:
                        menos multas automaticas, mas mediacion, economia comun y bienestar visible.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {LANES.map(lane => {
                            const Icon = lane.icon;
                            const selected = activeLane === lane.id;
                            return (
                                <button
                                    key={lane.id}
                                    type="button"
                                    onClick={() => setActiveLane(lane.id)}
                                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                                        selected ? "border-brand-500 bg-brand-50 text-brand-700" : "border-subtle bg-surface cc-text-secondary hover:border-brand-200"
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {lane.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Metric label="Mediaciones" value={mediations.length.toString()} detail="sin escalar a multa" />
                    <Metric label="Creditos" value={communityCredits.toString()} detail="apoyo visible" />
                    <Metric label="Ahorro colectivo" value={currency(collectiveSavings)} detail="vs retail" />
                    <Metric label="Proyectos" value={projects.length.toString()} detail="bien comun activo" />
                </div>
            </section>

            {activeLane === "mediation" && (
                <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-xl border border-subtle bg-surface p-6 shadow-sm">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div>
                                <Eyebrow>Mediacion activa</Eyebrow>
                                <h2 className="mt-1 text-xl font-semibold cc-text-primary">Redactar peticion CNV</h2>
                            </div>
                            <Tag tone="sage" solid>Observacion - Sentimiento - Necesidad - Peticion</Tag>
                        </div>
                        <form onSubmit={handleCreateMediation} className="space-y-4">
                            <Field label="Unidad destino">
                                <input value={mediationForm.targetUnit} onChange={event => setMediationForm(prev => ({ ...prev, targetUnit: event.target.value }))} placeholder="Ej. 804" className="input-premium h-11 w-full" />
                            </Field>
                            <Field label="Observacion concreta">
                                <input value={mediationForm.observation} onChange={event => setMediationForm(prev => ({ ...prev, observation: event.target.value }))} className="input-premium h-11 w-full" />
                            </Field>
                            <Field label="Sentimiento">
                                <select value={mediationForm.feeling} onChange={event => setMediationForm(prev => ({ ...prev, feeling: event.target.value }))} className="input-premium h-11 w-full">
                                    {cnvFeelings.map(item => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </Field>
                            <Field label="Necesidad">
                                <input value={mediationForm.need} onChange={event => setMediationForm(prev => ({ ...prev, need: event.target.value }))} className="input-premium h-11 w-full" />
                            </Field>
                            <Field label="Peticion amable">
                                <input value={mediationForm.request} onChange={event => setMediationForm(prev => ({ ...prev, request: event.target.value }))} className="input-premium h-11 w-full" />
                            </Field>
                            <Button type="submit" variant="copper" block>
                                Redactar con CoCo <MessageSquareHeart className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-xl border border-subtle bg-[#111827] p-6 text-white shadow-sm">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Mensaje privado sugerido</p>
                                    <h3 className="mt-1 text-xl font-semibold">CoCo baja el tono del conflicto</h3>
                                </div>
                                <HeartHandshake className="h-7 w-7 text-brand-300" />
                            </div>
                            <pre className="min-h-52 whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-100">
                                {lastDraft?.draftedMessage || "Completa el formulario para generar una peticion directa, empatica y accionable."}
                            </pre>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button type="button" variant="ghost" disabled={!lastDraft} onClick={copyDraft}>
                                    Copiar <Clipboard className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="copper" disabled={!lastDraft} onClick={() => lastDraft && updateMediation(lastDraft.id, "sent")}>
                                    Enviar privado <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="grid gap-3">
                            {mediations.slice(0, 3).map(item => (
                                <div key={item.id} className="rounded-xl border border-subtle bg-surface p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold cc-text-primary">Unidad {item.targetUnit}</p>
                                            <p className="mt-1 text-xs cc-text-secondary">{item.observation}</p>
                                        </div>
                                        <Tag tone={item.status === "sent" ? "sage" : "neutral"}>{item.status}</Tag>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {activeLane === "timebank" && (
                <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                    <FormShell eyebrow="Banco de tiempo" title="Ofrecer una ayuda">
                        <form onSubmit={handleCreateTimeBankOffer} className="space-y-4">
                            <Field label="Habilidad o recurso">
                                <input value={timeBankForm.skill} onChange={event => setTimeBankForm(prev => ({ ...prev, skill: event.target.value }))} placeholder="Ej. Presto mi taladro" className="input-premium h-11 w-full" />
                            </Field>
                            <Field label="Descripcion">
                                <textarea value={timeBankForm.description} onChange={event => setTimeBankForm(prev => ({ ...prev, description: event.target.value }))} placeholder="Cuenta como puedes ayudar." className="input-premium min-h-24 w-full resize-none py-3" />
                            </Field>
                            <Field label="Disponibilidad">
                                <input value={timeBankForm.availability} onChange={event => setTimeBankForm(prev => ({ ...prev, availability: event.target.value }))} placeholder="Ej. Sabados en la manana" className="input-premium h-11 w-full" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Categoria">
                                    <select value={timeBankForm.category} onChange={event => setTimeBankForm(prev => ({ ...prev, category: event.target.value as TimeBankOffer["category"] }))} className="input-premium h-11 w-full">
                                        {timeBankCategories.map(item => <option key={item} value={item}>{labelFromSlug(item)}</option>)}
                                    </select>
                                </Field>
                                <Field label="Creditos">
                                    <input type="number" min="1" max="8" value={timeBankForm.credits} onChange={event => setTimeBankForm(prev => ({ ...prev, credits: Number(event.target.value) }))} className="input-premium h-11 w-full" />
                                </Field>
                            </div>
                            <Button type="submit" variant="copper" block>Publicar apoyo <Plus className="h-4 w-4" /></Button>
                        </form>
                    </FormShell>

                    <div className="grid gap-4 md:grid-cols-2">
                        {timeBankOffers.map(offer => (
                            <div key={offer.id} className="rounded-xl border border-subtle bg-surface p-5 shadow-sm">
                                <div className="mb-4 flex items-start justify-between gap-3">
                                    <div>
                                        <Tag tone="sage">{labelFromSlug(offer.category)}</Tag>
                                        <h3 className="mt-3 text-lg font-semibold cc-text-primary">{offer.skill}</h3>
                                        <p className="mt-1 text-xs font-medium cc-text-tertiary">Depto {offer.unitLabel} - {offer.neighborName}</p>
                                    </div>
                                    <div className="rounded-lg bg-brand-50 px-3 py-2 text-center text-brand-700">
                                        <p className="text-lg font-bold">{offer.credits}</p>
                                        <p className="text-[10px] uppercase">creditos</p>
                                    </div>
                                </div>
                                <p className="text-sm leading-6 cc-text-secondary">{offer.description}</p>
                                <p className="mt-3 text-xs font-semibold cc-text-primary">Disponible: {offer.availability}</p>
                                <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => requestOffer(offer.id)}>
                                    Solicitar apoyo <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {activeLane === "abasto" && (
                <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                    <FormShell eyebrow="Abasto comunitario" title="Abrir compra colectiva">
                        <form onSubmit={handleCreatePurchase} className="space-y-4">
                            <Field label="Producto">
                                <input value={purchaseForm.title} onChange={event => setPurchaseForm(prev => ({ ...prev, title: event.target.value }))} placeholder="Ej. Bidones de agua 20L" className="input-premium h-11 w-full" />
                            </Field>
                            <Field label="Proveedor local">
                                <input value={purchaseForm.supplier} onChange={event => setPurchaseForm(prev => ({ ...prev, supplier: event.target.value }))} placeholder="Ej. Cooperativa local" className="input-premium h-11 w-full" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Precio mayorista">
                                    <input type="number" value={purchaseForm.unitPrice} onChange={event => setPurchaseForm(prev => ({ ...prev, unitPrice: Number(event.target.value) }))} className="input-premium h-11 w-full" />
                                </Field>
                                <Field label="Precio retail">
                                    <input type="number" value={purchaseForm.retailPrice} onChange={event => setPurchaseForm(prev => ({ ...prev, retailPrice: Number(event.target.value) }))} className="input-premium h-11 w-full" />
                                </Field>
                                <Field label="Minimo unidades">
                                    <input type="number" min="1" value={purchaseForm.minimumParticipants} onChange={event => setPurchaseForm(prev => ({ ...prev, minimumParticipants: Number(event.target.value) }))} className="input-premium h-11 w-full" />
                                </Field>
                                <Field label="Cierre">
                                    <input type="date" value={purchaseForm.deadline} onChange={event => setPurchaseForm(prev => ({ ...prev, deadline: event.target.value }))} className="input-premium h-11 w-full" />
                                </Field>
                            </div>
                            <Field label="Categoria">
                                <select value={purchaseForm.category} onChange={event => setPurchaseForm(prev => ({ ...prev, category: event.target.value as CollectivePurchaseCampaign["category"] }))} className="input-premium h-11 w-full">
                                    {purchaseCategories.map(item => <option key={item} value={item}>{labelFromSlug(item)}</option>)}
                                </select>
                            </Field>
                            <Button type="submit" variant="copper" block>Coordinar abasto <PackageCheck className="h-4 w-4" /></Button>
                        </form>
                    </FormShell>

                    <div className="grid gap-4">
                        {purchases.map(item => {
                            const progress = Math.min(100, Math.round((item.participants / item.minimumParticipants) * 100));
                            const savings = Math.max(0, item.retailPrice - item.unitPrice);
                            return (
                                <div key={item.id} className="rounded-xl border border-subtle bg-surface p-5 shadow-sm">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <div className="flex flex-wrap gap-2">
                                                <Tag tone="copper">{labelFromSlug(item.category)}</Tag>
                                                <Tag tone={item.status === "ready" ? "sage" : "neutral"}>{item.status === "ready" ? "Listo para ordenar" : "Sumando unidades"}</Tag>
                                            </div>
                                            <h3 className="mt-3 text-xl font-semibold cc-text-primary">{item.title}</h3>
                                            <p className="mt-1 text-sm cc-text-secondary">{item.supplier}</p>
                                        </div>
                                        <div className="rounded-lg bg-elevated px-4 py-3 text-right">
                                            <p className="text-lg font-bold cc-text-primary">{currency(savings)}</p>
                                            <p className="text-[10px] uppercase cc-text-tertiary">ahorro por unidad</p>
                                        </div>
                                    </div>
                                    <div className="mt-5">
                                        <div className="mb-2 flex justify-between text-xs font-semibold cc-text-secondary">
                                            <span>{item.participants} de {item.minimumParticipants} unidades</span>
                                            <span>Cierre {new Date(item.deadline).toLocaleDateString("es-CL")}</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-elevated">
                                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                    <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => joinPurchase(item.id)}>
                                        Sumar mi unidad <Users className="h-4 w-4" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {activeLane === "projects" && (
                <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                    <FormShell eyebrow="Plaza social" title="Crear proyecto comunitario">
                        <form onSubmit={handleCreateProject} className="space-y-4">
                            <Field label="Nombre">
                                <input value={projectForm.title} onChange={event => setProjectForm(prev => ({ ...prev, title: event.target.value }))} placeholder="Ej. Campana reciclaje cooperativo" className="input-premium h-11 w-full" />
                            </Field>
                            <Field label="Area">
                                <select value={projectForm.area} onChange={event => setProjectForm(prev => ({ ...prev, area: event.target.value as CommunityProject["area"] }))} className="input-premium h-11 w-full">
                                    {projectAreas.map(item => <option key={item} value={item}>{labelFromSlug(item)}</option>)}
                                </select>
                            </Field>
                            <Field label="Descripcion">
                                <textarea value={projectForm.description} onChange={event => setProjectForm(prev => ({ ...prev, description: event.target.value }))} className="input-premium min-h-24 w-full resize-none py-3" />
                            </Field>
                            <Field label="Impacto esperado">
                                <input value={projectForm.impact} onChange={event => setProjectForm(prev => ({ ...prev, impact: event.target.value }))} className="input-premium h-11 w-full" />
                            </Field>
                            <Field label="Que se necesita">
                                <input value={projectForm.needed} onChange={event => setProjectForm(prev => ({ ...prev, needed: event.target.value }))} className="input-premium h-11 w-full" />
                            </Field>
                            <Field label="Insight CoCo">
                                <textarea value={projectForm.cocoInsight} onChange={event => setProjectForm(prev => ({ ...prev, cocoInsight: event.target.value }))} placeholder="Ej. CoCo detecto 5 vecinos con mascotas pequenas en el piso 8." className="input-premium min-h-20 w-full resize-none py-3" />
                            </Field>
                            <Button type="submit" variant="copper" block>Activar proyecto <Leaf className="h-4 w-4" /></Button>
                        </form>
                    </FormShell>

                    <div className="grid gap-4">
                        {projects.map(project => (
                            <div key={project.id} className="rounded-xl border border-subtle bg-surface p-5 shadow-sm">
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <div className="flex flex-wrap gap-2">
                                            <Tag tone="sage">{labelFromSlug(project.area)}</Tag>
                                            <Tag tone={project.status === "active" ? "copper" : "neutral"}>{project.status}</Tag>
                                        </div>
                                        <h3 className="mt-3 text-xl font-semibold cc-text-primary">{project.title}</h3>
                                        <p className="mt-2 text-sm leading-6 cc-text-secondary">{project.description}</p>
                                    </div>
                                    <div className="rounded-lg bg-brand-50 px-4 py-3 text-center text-brand-700">
                                        <p className="text-2xl font-bold">{project.participants}</p>
                                        <p className="text-[10px] uppercase">vecinos</p>
                                    </div>
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <InfoBlock title="Impacto visible" value={project.impact} />
                                    <InfoBlock title="Se necesita" value={project.needed} />
                                </div>
                                <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/60 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700">Facilitacion CoCo</p>
                                    <p className="mt-2 text-sm leading-6 cc-text-secondary">{project.cocoInsight}</p>
                                </div>
                                <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => joinProject(project.id)}>
                                    Quiero participar <CheckCircle2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="rounded-xl border border-subtle bg-surface p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] cc-text-tertiary">{label}</p>
            <p className="mt-2 text-2xl font-bold cc-text-primary">{value}</p>
            <p className="mt-1 text-xs cc-text-secondary">{detail}</p>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] cc-text-tertiary">{label}</span>
            {children}
        </label>
    );
}

function FormShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-subtle bg-surface p-6 shadow-sm">
            <div className="mb-5">
                <Eyebrow>{eyebrow}</Eyebrow>
                <h2 className="mt-1 text-xl font-semibold cc-text-primary">{title}</h2>
            </div>
            {children}
        </div>
    );
}

function InfoBlock({ title, value }: { title: string; value: string }) {
    return (
        <div className="rounded-lg border border-subtle bg-elevated/40 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] cc-text-tertiary">{title}</p>
            <p className="mt-2 text-sm leading-6 cc-text-secondary">{value}</p>
        </div>
    );
}
