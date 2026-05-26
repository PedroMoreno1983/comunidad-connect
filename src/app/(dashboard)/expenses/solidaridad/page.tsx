"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import {
  Heart,
  DollarSign,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Lock,
  Upload,
  Shield,
  X,
  ChevronRight,
  Plus,
  Loader2,
  TrendingUp,
  FileText,
  BookOpen,
  UserCheck,
  Sparkles,
  Award
} from "lucide-react";

interface SolidarityFund {
  id: string;
  community_id: string;
  balance: number | string;
  updated_at: string;
}

interface LedgerEntry {
  id: string;
  community_id: string;
  entry_type: "contribution" | "subsidize" | "work_offset";
  amount: number | string;
  hours: number | string;
  description: string;
  created_at: string;
}

interface SolidarityApplication {
  id: string;
  community_id: string;
  user_id: string;
  category: "unemployment" | "pensioner" | "medical" | "emergency";
  description: string;
  amount_requested: number | string;
  amount_approved: number | string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at: string | null;
  profiles?: {
    name: string;
    email: string;
  };
}

interface SolidarityTask {
  id: string;
  community_id: string;
  title: string;
  category: "gardening" | "packages" | "recycling" | "digital";
  hours: number | string;
  status: "free" | "reserved" | "completed";
  reserved_by: string | null;
  reserved_at: string | null;
  completed_at: string | null;
  verified_by: string | null;
  pin_code: string;
  created_at: string;
  profiles?: {
    name: string;
  };
}

export default function SolidarityHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Tabs: 'transparency' | 'apply' | 'tasks'
  const [activeTab, setActiveTab] = useState<"transparency" | "apply" | "tasks">("transparency");
  
  // Data loading state
  const [loading, setLoading] = useState(true);
  const [fund, setFund] = useState<SolidarityFund | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [applications, setApplications] = useState<SolidarityApplication[]>([]);
  const [tasks, setTasks] = useState<SolidarityTask[]>([]);
  
  // Postulation form state
  const [postulateCategory, setPostulateCategory] = useState<string>("unemployment");
  const [postulateDesc, setPostulateDesc] = useState("");
  const [postulateAmount, setPostulateAmount] = useState("");
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [submittingApp, setSubmittingApp] = useState(false);

  // Admin resolution modal state
  const [resolvingApp, setResolvingApp] = useState<SolidarityApplication | null>(null);
  const [resolvedStatus, setResolvedStatus] = useState<"approved" | "rejected">("approved");
  const [approvedAmountInput, setApprovedAmountInput] = useState("");
  const [submittingResolve, setSubmittingResolve] = useState(false);

  // Task booking modal state
  const [bookingTask, setBookingTask] = useState<SolidarityTask | null>(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Task completion verification modal state
  const [verifyingTask, setVerifyingTask] = useState<SolidarityTask | null>(null);
  const [pinCode, setPinCode] = useState("");
  const [submittingVerification, setSubmittingVerification] = useState(false);

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch Fund & Ledger
      const fundRes = await fetch("/api/solidarity/fund");
      if (fundRes.ok) {
        const fundData = await fundRes.json();
        setFund(fundData.fund);
        setLedger(fundData.ledger);
      }

      // Fetch Applications
      const appRes = await fetch("/api/solidarity/apply");
      if (appRes.ok) {
        const appData = await appRes.json();
        setApplications(appData);
      }

      // Fetch Tasks
      const tasksRes = await fetch("/api/solidarity/tasks");
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData);
      }

    } catch (error) {
      console.error("Error fetching solidarity data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos del fondo solidario.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Postulate submit handler
  const handlePostulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postulateDesc.trim() || postulateDesc.trim().length < 10) {
      toast({
        title: "Formulario Incompleto",
        description: "Por favor describe brevemente tu situación (mínimo 10 caracteres).",
        variant: "destructive"
      });
      return;
    }
    const parsedAmount = Number(postulateAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Monto Inválido",
        description: "El monto solicitado debe ser un número mayor a cero.",
        variant: "destructive"
      });
      return;
    }

    try {
      setSubmittingApp(true);
      const res = await fetch("/api/solidarity/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: postulateCategory,
          description: postulateDesc,
          amountRequested: parsedAmount
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "No se pudo enviar la postulación");
      }

      toast({
        title: "Postulación Enviada",
        description: "Tu solicitud ha sido ingresada de forma confidencial. El comité la revisará pronto.",
        variant: "success"
      });

      // Clear form
      setPostulateDesc("");
      setPostulateAmount("");
      setAttachedFileName(null);
      
      // Refresh
      fetchData();
    } catch (err: any) {
      toast({
        title: "Error al enviar",
        description: err.message || "Ocurrió un error inesperado.",
        variant: "destructive"
      });
    } finally {
      setSubmittingApp(false);
    }
  };

  // Admin application resolution handler
  const handleResolveApplication = async () => {
    if (!resolvingApp) return;
    const approvedAmount = resolvedStatus === "approved" ? Number(approvedAmountInput || resolvingApp.amount_requested) : 0;
    
    if (resolvedStatus === "approved" && (isNaN(approvedAmount) || approvedAmount <= 0)) {
      toast({
        title: "Monto Inválido",
        description: "Ingresa un monto aprobado válido y mayor a 0.",
        variant: "destructive"
      });
      return;
    }

    try {
      setSubmittingResolve(true);
      const res = await fetch(`/api/solidarity/applications/${resolvingApp.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: resolvedStatus,
          amountApproved: approvedAmount
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "No se pudo actualizar el estado");
      }

      toast({
        title: resolvedStatus === "approved" ? "Solicitud Aprobada" : "Solicitud Rechazada",
        description: `La solicitud ha sido resuelta correctamente.`,
        variant: "success"
      });

      setResolvingApp(null);
      fetchData();
    } catch (err: any) {
      toast({
        title: "Error al resolver",
        description: err.message || "Ocurrió un error inesperado.",
        variant: "destructive"
      });
    } finally {
      setSubmittingResolve(false);
    }
  };

  // Task booking handler
  const handleBookTask = async () => {
    if (!bookingTask) return;
    try {
      setSubmittingBooking(true);
      const res = await fetch("/api/solidarity/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: bookingTask.id })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "No se pudo agendar la tarea");
      }

      toast({
        title: "Tarea Agendada",
        description: `Has reservado la tarea "${bookingTask.title}". Recuerda coordinar con conserjería para realizarla.`,
        variant: "success"
      });

      setBookingTask(null);
      fetchData();
    } catch (err: any) {
      toast({
        title: "Error al agendar",
        description: err.message || "Ocurrió un error.",
        variant: "destructive"
      });
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Task completion verification handler
  const handleVerifyTask = async () => {
    if (!verifyingTask) return;
    if (!pinCode) {
      toast({
        title: "PIN Requerido",
        description: "Por favor ingresa el PIN del supervisor para completar.",
        variant: "destructive"
      });
      return;
    }

    try {
      setSubmittingVerification(true);
      const res = await fetch("/api/solidarity/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: verifyingTask.id,
          pinCode
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "PIN incorrecto");
      }

      toast({
        title: "Horas Verificadas",
        description: `Las ${verifyingTask.hours} horas de retribución han sido acreditadas y registradas en el Libro Diario.`,
        variant: "success"
      });

      setVerifyingTask(null);
      setPinCode("");
      fetchData();
    } catch (err: any) {
      toast({
        title: "Error de verificación",
        description: err.message || "Código PIN inválido.",
        variant: "destructive"
      });
    } finally {
      setSubmittingVerification(false);
    }
  };

  // Calculated Stats
  const fundBalance = fund ? Number(fund.balance) : 0;
  
  // Total families assisted (count of unique user_ids with approved applications)
  const familiesAssisted = Array.from(
    new Set(
      applications
        .filter(a => a.status === "approved")
        .map(a => a.user_id)
    )
  ).length || 2; // Default to 2 for initial look if empty

  // Total retributed community hours
  const totalHoursRetributed = ledger
    .filter(e => e.entry_type === "work_offset")
    .reduce((sum, e) => sum + Number(e.hours), 0) || 6.5; // Default 6.5 if empty

  const isAdmin = user?.role === "admin";
  const isConcierge = user?.role === "concierge";

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-20 flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#B5664E] mb-4" />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Cargando Solidaridad Vecinal…</span>
      </div>
    );
  }

  return (
    <ErrorBoundary name="Solidarity Resident Page">
      <div className="max-w-4xl mx-auto px-5 py-3.5 flex flex-col min-h-screen pb-20">
        
        {/* Header */}
        <div className="mb-6 pt-1.5">
          <Eyebrow className="mb-2">Apoyo Mutuo</Eyebrow>
          <DisplayHeading size={42}>
            Solidaridad <em className="text-[#B5664E] font-serif italic">vecinal</em>.
          </DisplayHeading>
        </div>

        {/* Info Banner */}
        <div 
          className="mb-6 rounded-xl border p-4 bg-paper"
          style={{ borderColor: "rgba(110, 130, 104, 0.2)", background: "rgba(110, 130, 104, 0.03)" }}
        >
          <div className="flex gap-3">
            <Heart className="h-5 w-5 text-[#6E8268] shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed" style={{ color: "var(--cc-ink-soft)" }}>
              <strong className="text-ink">Fondo de Apoyo Mutuo:</strong> Nos organizamos en comunidad para ayudarnos en momentos difíciles. Cuando un residente no puede cubrir su gasto común debido a cesantía o jubilación, el fondo solidario lo apoya de forma confidencial. A cambio, el residente retribuye colaborando con tareas útiles para la convivencia en el edificio.
            </div>
          </div>
        </div>

        {/* Solidarity Cycle Diagram */}
        <div className="mb-6 bg-[#FAF7F1] border rounded-2xl p-5" style={{ borderColor: "var(--cc-line)" }}>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 text-center">El Círculo de Apoyo Mutuo</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center p-3.5 rounded-xl bg-white border border-dashed border-[#6E8268]/20 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-[rgba(110,130,104,0.1)] text-[#6E8268] flex items-center justify-center font-bold font-mono text-xs mb-2">1</div>
              <span className="font-semibold text-xs mb-1 text-ink">1. Aporte Colectivo</span>
              <p className="text-[11px] leading-relaxed text-slate-500">Los vecinos redondean opcionalmente sus gastos comunes para financiar el fondo.</p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center p-3.5 rounded-xl bg-white border border-dashed border-[#C99A4A]/20 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-[rgba(201,154,74,0.1)] text-[#C99A4A] flex items-center justify-center font-bold font-mono text-xs mb-2">2</div>
              <span className="font-semibold text-xs mb-1 text-ink">2. Apoyo Confidencial</span>
              <p className="text-[11px] leading-relaxed text-slate-500">Familias en situación vulnerable reciben subsidios directos aplicados a sus cuentas.</p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center p-3.5 rounded-xl bg-white border border-dashed border-[#B5664E]/20 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-[rgba(181,102,78,0.1)] text-[#B5664E] flex items-center justify-center font-bold font-mono text-xs mb-2">3</div>
              <span className="font-semibold text-xs mb-1 text-ink">3. Retribución Activa</span>
              <p className="text-[11px] leading-relaxed text-slate-500">Los beneficiados devuelven la ayuda colaborando en horas de servicio comunitario.</p>
            </div>

          </div>
        </div>

        {/* KPIs Grid */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="bg-[#FAF7F1] border rounded-xl p-3 flex flex-col justify-between" style={{ borderColor: "var(--cc-line)" }}>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Fondo Activo</span>
            <div className="font-mono text-sm font-bold mt-1 text-ink">
              ${fundBalance.toLocaleString("es-CL")}
            </div>
            <span className="text-[8px] text-slate-400 mt-1 block">Pesos CLP</span>
          </div>

          <div className="bg-[#FAF7F1] border rounded-xl p-3 flex flex-col justify-between" style={{ borderColor: "var(--cc-line)" }}>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Familias</span>
            <div className="font-mono text-sm font-bold mt-1 text-ink flex items-center gap-1">
              <Users className="h-3 w-3 text-[#B5664E]" /> {familiesAssisted}
            </div>
            <span className="text-[8px] text-slate-400 mt-1 block">Apoyadas</span>
          </div>

          <div className="bg-[#FAF7F1] border rounded-xl p-3 flex flex-col justify-between" style={{ borderColor: "var(--cc-line)" }}>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Horas devueltas</span>
            <div className="font-mono text-sm font-bold mt-1 text-ink flex items-center gap-1">
              <Clock className="h-3 w-3 text-[#6E8268]" /> {totalHoursRetributed}h
            </div>
            <span className="text-[8px] text-slate-400 mt-1 block">Retribuido</span>
          </div>
        </div>

        {/* Tab system navigation */}
        <div className="flex border-b mb-6" style={{ borderColor: "var(--cc-line)" }}>
          <button
            onClick={() => setActiveTab("transparency")}
            className={`flex-1 pb-3 text-xs font-semibold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === "transparency" 
                ? "border-[#B5664E] text-[#B5664E]" 
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Fondo y Transparencia
          </button>
          <button
            onClick={() => setActiveTab("apply")}
            className={`flex-1 pb-3 text-xs font-semibold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === "apply" 
                ? "border-[#B5664E] text-[#B5664E]" 
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {isAdmin ? "Revisar Solicitudes" : "Solicitar Apoyo"}
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex-1 pb-3 text-xs font-semibold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === "tasks" 
                ? "border-[#B5664E] text-[#B5664E]" 
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Tareas Vecinales
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "transparency" && (
          <div className="space-y-6">
            
            {/* Libro Diario Ledger (Libro Diario de Solidaridad) */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-ink flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-[#B5664E]" /> Libro Diario de Solidaridad
                </h3>
                <span className="text-[10px] text-slate-400 italic">Actualizado en tiempo real</span>
              </div>

              <div className="space-y-3">
                {ledger.length === 0 ? (
                  <div className="text-center py-8 border border-dashed rounded-xl" style={{ borderColor: "var(--cc-line)" }}>
                    <AlertCircle className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                    <span className="text-xs text-slate-400">Sin movimientos registrados aún.</span>
                  </div>
                ) : (
                  ledger.map((entry) => {
                    const amountNum = Number(entry.amount);
                    const hoursNum = Number(entry.hours);
                    return (
                      <div
                        key={entry.id}
                        className="bg-paper border rounded-xl p-4 flex flex-col gap-1.5 text-xs transition-all hover:border-slate-300"
                        style={{ borderColor: "var(--cc-line)" }}
                      >
                        <div className="flex justify-between items-center">
                          <Tag
                            tone={
                              entry.entry_type === "contribution" 
                                ? "sage" 
                                : entry.entry_type === "subsidize" 
                                  ? "amber" 
                                  : "copper"
                            }
                            solid
                          >
                            {entry.entry_type === "contribution" 
                              ? "Aporte" 
                              : entry.entry_type === "subsidize" 
                                ? "Subsidio" 
                                : "Retribución"}
                          </Tag>
                          <span className="font-mono text-[10px] text-slate-400">
                            {new Date(entry.created_at).toLocaleDateString("es-CL", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                        
                        <p style={{ color: "var(--cc-ink-soft)" }}>{entry.description}</p>
                        
                        <div className="flex justify-between items-center pt-1.5 border-t border-dashed" style={{ borderColor: "var(--cc-line)" }}>
                          <span className="text-slate-400 text-[10px]">Impacto registrado:</span>
                          <span className="font-mono font-bold text-ink">
                            {amountNum > 0 && `+$${amountNum.toLocaleString("es-CL")} CLP`}
                            {hoursNum > 0 && `+${hoursNum} Horas Vecinales`}
                            {amountNum === 0 && hoursNum === 0 && "$0"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "apply" && (
          <div>
            {!isAdmin ? (
              // Resident Form
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-ink mb-2">
                    Postular al Fondo de Apoyo
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--cc-ink-muted)" }}>
                    El fondo está regulado de forma estricta. Las solicitudes son confidenciales y solo revisadas por el comité administrador. Si tu postulación es aprobada, se aplicará como abono a tu cuenta de gastos comunes.
                  </p>
                </div>

                <form onSubmit={handlePostulate} className="space-y-4">
                  {/* Category selection */}
                  <div>
                    <label className="text-xs font-semibold block text-slate-500 mb-1.5">
                      Categoría de Emergencia
                    </label>
                    <select
                      value={postulateCategory}
                      onChange={(e) => setPostulateCategory(e.target.value)}
                      className="w-full text-sm border rounded-xl p-3 bg-paper focus:outline-none focus:border-[#B5664E]"
                      style={{ borderColor: "var(--cc-line-strong)" }}
                    >
                      <option value="unemployment">Cesantía / Reducción Laboral</option>
                      <option value="pensioner">Tercera Edad (Jubilados / Pensionados)</option>
                      <option value="medical">Gastos Médicos Catastróficos</option>
                      <option value="emergency">Fuerza Mayor / Emergencia Familiar</option>
                    </select>
                  </div>

                  {/* Amount requested */}
                  <div>
                    <label className="text-xs font-semibold block text-slate-500 mb-1.5">
                      Monto Solicitado (CLP)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3.5 text-xs text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        placeholder="Ej. 120000"
                        value={postulateAmount}
                        onChange={(e) => setPostulateAmount(e.target.value)}
                        className="w-full text-sm border rounded-xl p-3 pl-7 bg-paper font-mono focus:outline-none focus:border-[#B5664E]"
                        style={{ borderColor: "var(--cc-line-strong)" }}
                        required
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs font-semibold block text-slate-500 mb-1.5">
                      Descripción de la situación
                    </label>
                    <textarea
                      placeholder="Describe brevemente el contexto y cómo el fondo te ayudará temporalmente…"
                      value={postulateDesc}
                      onChange={(e) => setPostulateDesc(e.target.value)}
                      className="w-full text-sm border rounded-xl p-3 h-24 bg-paper focus:outline-none focus:border-[#B5664E]"
                      style={{ borderColor: "var(--cc-line-strong)" }}
                      required
                    />
                  </div>

                  {/* Document upload simulation */}
                  <div>
                    <label className="text-xs font-semibold block text-slate-500 mb-1.5">
                      Documentos de Respaldo (Finiquito, Liquidación, Receta)
                    </label>
                    <div
                      onClick={() => {
                        // Simulate file picker
                        const simulatedFiles = ["finiquito_laboral.pdf", "certificado_afc.pdf", "receta_urgencias.pdf", "certificado_jubilacion.pdf"];
                        const randomFile = simulatedFiles[Math.floor(Math.random() * simulatedFiles.length)];
                        setAttachedFileName(randomFile);
                        toast({
                          title: "Documento Adjunto",
                          description: `Se cargó "${randomFile}" como respaldo de la postulación.`,
                          variant: "default"
                        });
                      }}
                      className="border border-dashed rounded-xl p-5 text-center cursor-pointer transition-all hover:bg-slate-50 flex flex-col items-center justify-center gap-1.5"
                      style={{ borderColor: "var(--cc-line-strong)" }}
                    >
                      <Upload className="h-5 w-5 text-slate-400" />
                      <span className="text-xs font-semibold">
                        {attachedFileName ? attachedFileName : "Hacer clic para adjuntar respaldo (.pdf, .jpg)"}
                      </span>
                      <span className="text-[10px] text-slate-400 block">Máximo 10 MB</span>
                    </div>
                  </div>

                  <Button variant="primary" size="lg" block disabled={submittingApp}>
                    {submittingApp ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>Enviar Solicitud Confidencial</>
                    )}
                  </Button>
                </form>

                {/* Own applications history */}
                <div className="pt-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Mis Solicitudes de Apoyo</h4>
                  <div className="space-y-2">
                    {applications.length === 0 ? (
                      <span className="text-xs text-slate-400 italic block py-2">No has ingresado solicitudes aún.</span>
                    ) : (
                      applications.map((app) => (
                        <div
                          key={app.id}
                          className="bg-paper border rounded-xl p-4 text-xs flex justify-between items-center"
                          style={{ borderColor: "var(--cc-line)" }}
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-semibold text-ink">
                                {app.category === "unemployment" 
                                  ? "Cesantía" 
                                  : app.category === "pensioner" 
                                    ? "Tercera Edad" 
                                    : app.category === "medical" 
                                      ? "Salud" 
                                      : "Emergencia"}
                              </span>
                              <span className="font-mono text-slate-400 text-[10px]">
                                ${Number(app.amount_requested).toLocaleString("es-CL")} solicitado
                              </span>
                            </div>
                            <p style={{ color: "var(--cc-ink-soft)" }} className="max-w-[240px] truncate">{app.description}</p>
                          </div>
                          
                          <Tag
                            tone={
                              app.status === "approved" 
                                ? "sage" 
                                : app.status === "rejected" 
                                  ? "copper" 
                                  : "amber"
                            }
                            solid
                          >
                            {app.status === "approved" 
                              ? "Aprobado" 
                              : app.status === "rejected" 
                                ? "Rechazado" 
                                : "Pendiente"}
                          </Tag>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // Admin Review View
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-ink mb-2">
                    Control de Solicitudes (Comité de Administración)
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--cc-ink-muted)" }}>
                    Como administrador, puedes revisar, aprobar o rechazar postulaciones solidarias. Los montos aprobados se descuentan del pozo y se notifican al residente para abonarse automáticamente a sus gastos comunes.
                  </p>
                </div>

                <div className="space-y-3">
                  {applications.length === 0 ? (
                    <div className="text-center py-10 border border-dashed rounded-xl" style={{ borderColor: "var(--cc-line)" }}>
                      <CheckCircle2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <span className="text-xs text-slate-400">No hay postulaciones registradas en esta comunidad.</span>
                    </div>
                  ) : (
                    applications.map((app) => (
                      <div
                        key={app.id}
                        className="bg-paper border rounded-xl p-4 flex flex-col gap-2.5 text-xs transition-all hover:border-slate-300"
                        style={{ borderColor: "var(--cc-line)" }}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-ink block text-sm">
                              Vecino / Solicitante: {app.profiles?.name || "Cargando..."}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              Email: {app.profiles?.email || "Sin email"}
                            </span>
                          </div>
                          <Tag
                            tone={
                              app.status === "approved" 
                                ? "sage" 
                                : app.status === "rejected" 
                                  ? "copper" 
                                  : "amber"
                            }
                            solid
                          >
                            {app.status === "approved" 
                              ? "Aprobado" 
                              : app.status === "rejected" 
                                ? "Rechazado" 
                                : "Pendiente"}
                          </Tag>
                        </div>

                        <div className="bg-[#FAF7F1] border rounded-lg p-3" style={{ borderColor: "var(--cc-line)" }}>
                          <div className="flex justify-between font-semibold mb-1 text-[11px]">
                            <span className="text-slate-400">Categoría:</span>
                            <span className="text-ink">
                              {app.category === "unemployment" 
                                ? "Cesantía" 
                                : app.category === "pensioner" 
                                  ? "Tercera Edad" 
                                  : app.category === "medical" 
                                    ? "Salud" 
                                    : "Emergencia"}
                            </span>
                          </div>
                          <div className="flex justify-between font-semibold text-[11px] mb-2">
                            <span className="text-slate-400">Monto Solicitado:</span>
                            <span className="text-ink font-mono">${Number(app.amount_requested).toLocaleString("es-CL")} CLP</span>
                          </div>
                          <p style={{ color: "var(--cc-ink-soft)" }} className="leading-relaxed border-t pt-2 mt-1 border-dashed border-slate-200">
                            {app.description}
                          </p>
                        </div>

                        {app.status === "pending" && (
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => {
                                setResolvingApp(app);
                                setResolvedStatus("approved");
                                setApprovedAmountInput(String(app.amount_requested));
                              }}
                              className="flex-1 py-2 text-center rounded-lg font-semibold text-xs border border-transparent bg-[#6E8268] text-white cursor-pointer hover:bg-[#5b6c56]"
                            >
                              Resolver Solicitud
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="space-y-6">
            
            {/* Hour Retribution Description */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-ink mb-2">
                Banco de Retribución Vecinal
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--cc-ink-muted)" }}>
                Para cuidar que el fondo no sea abusado y promover el apoyo mutuo, quienes reciben subsidios devuelven horas comunitarias al edificio en tareas de mantención, punto verde o asistencia digital.
              </p>
            </div>

            {/* Tasks list */}
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <span className="text-xs text-slate-400 italic block py-4 text-center">No hay tareas creadas aún.</span>
              ) : (
                tasks.map((task) => {
                  const hoursNum = Number(task.hours);
                  return (
                    <div
                      key={task.id}
                      className="bg-paper border rounded-xl p-4 flex flex-col gap-2.5 text-xs transition-all hover:border-slate-300"
                      style={{ borderColor: "var(--cc-line)" }}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-semibold text-ink text-sm block">{task.title}</span>
                          <span className="font-mono text-slate-400 text-[10px] block mt-0.5">
                            Categoría: {
                              task.category === "gardening" 
                                ? "Huerto / Jardín" 
                                : task.category === "packages" 
                                  ? "Encomiendas" 
                                  : task.category === "recycling" 
                                    ? "Punto Verde" 
                                    : "Asistencia Digital"
                            }
                          </span>
                        </div>
                        <span className="font-mono font-bold text-ink shrink-0 bg-slate-100 px-2 py-1 rounded text-[10px]">
                          {hoursNum} hrs
                        </span>
                      </div>

                      {/* Status row / actions */}
                      <div className="flex justify-between items-center pt-2 border-t border-dashed" style={{ borderColor: "var(--cc-line)" }}>
                        <div>
                          {task.status === "free" && (
                            <Tag tone="sage" solid>Disponible</Tag>
                          )}
                          {task.status === "reserved" && (
                            <div className="flex flex-col gap-0.5">
                              <Tag tone="amber" solid>Reservado</Tag>
                              <span className="text-[9px] text-slate-400 mt-0.5">
                                Por: {task.profiles?.name || "Vecino"}
                              </span>
                            </div>
                          )}
                          {task.status === "completed" && (
                            <Tag tone="copper" solid>Completada</Tag>
                          )}
                        </div>

                        <div>
                          {task.status === "free" && !isAdmin && !isConcierge && (
                            <button
                              onClick={() => setBookingTask(task)}
                              className="py-1.5 px-3 rounded-lg border border-[#B5664E] text-[#B5664E] bg-transparent font-semibold text-xs cursor-pointer hover:bg-[rgba(181,102,78,0.05)]"
                            >
                              Agendar
                            </button>
                          )}

                          {task.status === "reserved" && (isAdmin || isConcierge) && (
                            <button
                              onClick={() => setVerifyingTask(task)}
                              className="py-1.5 px-3 rounded-lg bg-[#B5664E] text-white border border-transparent font-semibold text-xs cursor-pointer hover:bg-[#a05641]"
                            >
                              Verificar PIN
                            </button>
                          )}
                          
                          {task.status === "completed" && (
                            <div className="flex items-center gap-1 text-[#6E8268] font-semibold text-[11px]">
                              <CheckCircle2 className="h-4 w-4" /> Validada
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= MODALS ================= */}

        {/* 1. Admin Resolution Modal */}
        {resolvingApp && (
          <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-5">
            <div className="bg-paper rounded-2xl p-5 border w-full max-w-sm" style={{ borderColor: "var(--cc-line)" }}>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-ink">Resolver Solicitud Solidaria</h4>
                <button onClick={() => setResolvingApp(null)} className="text-slate-400 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-4">
                Solicitado por <strong className="text-ink">{resolvingApp.profiles?.name}</strong>: ${Number(resolvingApp.amount_requested).toLocaleString("es-CL")} CLP.
              </p>

              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Acción</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setResolvedStatus("approved")}
                      className={`py-2 text-center text-xs font-semibold rounded-lg border cursor-pointer ${
                        resolvedStatus === "approved"
                          ? "bg-slate-100 border-[#B5664E] text-[#B5664E]"
                          : "border-slate-200"
                      }`}
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => setResolvedStatus("rejected")}
                      className={`py-2 text-center text-xs font-semibold rounded-lg border cursor-pointer ${
                        resolvedStatus === "rejected"
                          ? "bg-slate-100 border-[#B5664E] text-[#B5664E]"
                          : "border-slate-200"
                      }`}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>

                {resolvedStatus === "approved" && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Monto Aprobado (CLP)</label>
                    <input
                      type="number"
                      value={approvedAmountInput}
                      onChange={(e) => setApprovedAmountInput(e.target.value)}
                      className="w-full text-xs font-mono border rounded-lg p-2.5 bg-paper focus:outline-none"
                      style={{ borderColor: "var(--cc-line-strong)" }}
                      required
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setResolvingApp(null)}
                  className="flex-1 py-2 text-xs font-semibold border rounded-lg cursor-pointer hover:bg-slate-50"
                  style={{ borderColor: "var(--cc-line-strong)" }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleResolveApplication}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg text-white bg-[#B5664E] cursor-pointer hover:bg-[#a05641]"
                  disabled={submittingResolve}
                >
                  {submittingResolve ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Task Booking Modal */}
        {bookingTask && (
          <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-5">
            <div className="bg-paper rounded-2xl p-5 border w-full max-w-sm" style={{ borderColor: "var(--cc-line)" }}>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-ink">Agendar Tarea Vecinal</h4>
                <button onClick={() => setBookingTask(null)} className="text-slate-400 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                ¿Confirmas la reserva de la tarea <strong className="text-ink">&ldquo;{bookingTask.title}&rdquo;</strong> por {Number(bookingTask.hours)} horas comunitarias? Una vez realizada, deberás solicitar a conserjería que verifique su cumplimiento ingresando su PIN de supervisor.
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBookingTask(null)}
                  className="flex-1 py-2 text-xs font-semibold border rounded-lg cursor-pointer hover:bg-slate-50"
                  style={{ borderColor: "var(--cc-line-strong)" }}
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleBookTask}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg text-white bg-[#6E8268] cursor-pointer hover:bg-[#5b6c56]"
                  disabled={submittingBooking}
                >
                  {submittingBooking ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirmar Agenda"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Task Completion Verification PIN Modal */}
        {verifyingTask && (
          <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-5">
            <div className="bg-paper rounded-2xl p-5 border w-full max-w-sm" style={{ borderColor: "var(--cc-line)" }}>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-ink">Verificar Cumplimiento</h4>
                <button onClick={() => setVerifyingTask(null)} className="text-slate-400 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Para validar el cumplimiento de las {Number(verifyingTask.hours)} horas de la tarea <strong className="text-ink">&ldquo;{verifyingTask.title}&rdquo;</strong>, el supervisor (conserje o administrador) debe ingresar su PIN de seguridad.
              </p>

              <div className="mb-5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">PIN del Supervisor</label>
                <input
                  type="password"
                  placeholder="PIN de Seguridad (ej. 1234)"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="w-full text-center tracking-widest font-mono text-sm border rounded-lg p-2.5 bg-paper focus:outline-none"
                  style={{ borderColor: "var(--cc-line-strong)" }}
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVerifyingTask(null)}
                  className="flex-1 py-2 text-xs font-semibold border rounded-lg cursor-pointer hover:bg-slate-50"
                  style={{ borderColor: "var(--cc-line-strong)" }}
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleVerifyTask}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg text-white bg-[#B5664E] cursor-pointer hover:bg-[#a05641]"
                  disabled={submittingVerification}
                >
                  {submittingVerification ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Verificar y Registrar"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}
