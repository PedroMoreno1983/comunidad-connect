"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";
import { BrandWordmark } from "@/components/BrandWordmark";
import { useToast } from "@/components/ui/Toast";

const steps = [
  {
    title: "Sube los archivos",
    description: "Residentes, gastos, reglamento, espacios y proveedores en el formato que ya tienes.",
    icon: ClipboardList,
  },
  {
    title: "CoCo interpreta",
    description: "Detecta unidades, contactos, brechas, reglas relevantes y modulos recomendados.",
    icon: UploadCloud,
  },
  {
    title: "Apruebas y activa",
    description: "La administracion revisa el resumen, corrige dudas y confirma la creacion.",
    icon: ShieldCheck,
  },
];

const checklist = [
  "Tenant propio con direccion georreferenciada",
  "Unidades, residentes y roles propuestos",
  "Gastos comunes iniciales y brechas visibles",
  "Reglamento resumido para CoCo y aula virtual",
  "Checklist de pagos, WhatsApp y comunicaciones",
];

const documentOptions = [
  "Nomina residentes/unidades",
  "Gastos comunes",
  "Reglamento PDF",
  "Espacios comunes",
  "Proveedores y conserjeria",
];

export default function OnboardingPage() {
  const { toast } = useToast();
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [condoName, setCondoName] = useState("");
  const [units, setUnits] = useState("");
  const [priority, setPriority] = useState("Activacion completa con CoCo");
  const [documents, setDocuments] = useState<string[]>(["Nomina residentes/unidades"]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminName.trim() || !adminEmail.trim() || !condoName.trim()) {
      toast({
        title: "Faltan datos",
        description: "Completa nombre, correo y condominio para preparar la activacion.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/email/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName,
          adminEmail,
          condoName,
          message: `Solicitud activacion inteligente. Telefono: ${phone || "No informado"}. Unidades: ${units || "No informado"}. Prioridad: ${priority}. Documentos disponibles: ${documents.join(", ") || "No informado"}.`,
        }),
      });

      if (!response.ok) throw new Error("No se pudo registrar la solicitud.");

      setSent(true);
      toast({
        title: "Activacion solicitada",
        description: "Registramos el edificio y los documentos disponibles para preparar la carga inteligente.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo registrar",
        description: error instanceof Error ? error.message : "Intenta nuevamente en unos segundos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4EFE6] text-[#1A1611]">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(26,22,17,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(26,22,17,0.035)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 md:px-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#C8705A] text-white shadow-lg shadow-[#C8705A]/25">
              <Building2 className="h-5 w-5" />
            </span>
            <BrandWordmark className="text-lg text-[#C8705A]" />
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-[#E4D8CA] bg-white/70 px-4 py-2.5 text-sm font-bold text-[#5F5A54] transition hover:bg-white">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#6E8268]/20 bg-[#6E8268]/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#6E8268]">
              <CalendarClock className="h-4 w-4" />
              Activacion inteligente con CoCo
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-normal leading-[1.04] tracking-tight md:text-6xl" style={{ fontFamily: "var(--cc-font-display)" }}>
                Sube tus datos y CoCo arma el edificio operativo.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-[#524A40] md:text-lg">
                La experiencia premium parte con documentos reales, interpretacion asistida y aprobacion antes de crear usuarios, gastos o invitaciones.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <article key={step.title} className="rounded-2xl border border-[#E4D8CA] bg-white/72 p-4 shadow-sm">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#C8705A]/10 text-[#B45F4B]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-sm font-bold">{step.title}</h2>
                    <p className="mt-2 text-xs leading-5 text-[#6F665D]">{step.description}</p>
                  </article>
                );
              })}
            </div>

            <div className="rounded-3xl border border-[#E4D8CA] bg-[#1A1611] p-6 text-white shadow-xl">
              <div className="mb-4 flex items-center gap-2 text-[#D9A691]">
                <Sparkles className="h-5 w-5" />
                <p className="text-xs font-bold uppercase tracking-[0.16em]">Entregable del arranque</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {checklist.map((item) => (
                  <div key={item} className="flex gap-2 text-sm text-white/78">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6E8268]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section className="rounded-[2rem] border border-[#E4D8CA] bg-white p-6 shadow-2xl shadow-[#1A1611]/10 sm:p-8">
            {sent ? (
              <div className="flex min-h-[520px] flex-col justify-center text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6E8268]/12 text-[#6E8268]">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="text-3xl font-semibold tracking-tight">Solicitud recibida</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#6F665D]">
                  Dejamos registrada la activacion para {condoName}. El siguiente paso es crear el condominio y entrar al centro de carga asistida.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <Link href="/admin-onboarding" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1611] px-4 py-3 text-sm font-bold text-white">
                    Crear condominio
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="/" className="inline-flex items-center justify-center rounded-xl border border-[#E4D8CA] px-4 py-3 text-sm font-bold text-[#5F5A54]">
                    Volver al inicio
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6E8268]">Preactivacion IA</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">Cuéntanos qué puede leer CoCo</h2>
                  <p className="mt-2 text-sm leading-6 text-[#6F665D]">
                    Con estos datos el flujo queda preparado para crear comunidad, cargar archivos y revisar brechas sin partir desde cero.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nombre administrador" icon={<Users className="h-4 w-4" />}>
                    <input value={adminName} onChange={(event) => setAdminName(event.target.value)} className="w-full rounded-xl border border-[#E4D8CA] bg-[#FAF7F1] px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-[#A39A91] focus:border-[#B5664E] focus:ring-4 focus:ring-[#B5664E]/12" placeholder="Pedro Moreno" />
                  </Field>
                  <Field label="Correo" icon={<Mail className="h-4 w-4" />}>
                    <input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="w-full rounded-xl border border-[#E4D8CA] bg-[#FAF7F1] px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-[#A39A91] focus:border-[#B5664E] focus:ring-4 focus:ring-[#B5664E]/12" placeholder="admin@condominio.cl" />
                  </Field>
                </div>

                <Field label="Nombre del condominio" icon={<Building2 className="h-4 w-4" />}>
                  <input value={condoName} onChange={(event) => setCondoName(event.target.value)} className="w-full rounded-xl border border-[#E4D8CA] bg-[#FAF7F1] px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-[#A39A91] focus:border-[#B5664E] focus:ring-4 focus:ring-[#B5664E]/12" placeholder="Edificio Plaza Mayor" />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Telefono" icon={<Phone className="h-4 w-4" />}>
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-xl border border-[#E4D8CA] bg-[#FAF7F1] px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-[#A39A91] focus:border-[#B5664E] focus:ring-4 focus:ring-[#B5664E]/12" placeholder="+56 9 1234 5678" />
                  </Field>
                  <Field label="Unidades aprox." icon={<MapPin className="h-4 w-4" />}>
                    <input value={units} onChange={(event) => setUnits(event.target.value)} className="w-full rounded-xl border border-[#E4D8CA] bg-[#FAF7F1] px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-[#A39A91] focus:border-[#B5664E] focus:ring-4 focus:ring-[#B5664E]/12" placeholder="80" />
                  </Field>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#8A8580]">Prioridad inicial</label>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    className="w-full rounded-xl border border-[#E4D8CA] bg-[#FAF7F1] px-4 py-3 text-sm font-semibold outline-none transition focus:border-[#B5664E] focus:ring-4 focus:ring-[#B5664E]/12"
                  >
                    <option>Activacion completa con CoCo</option>
                    <option>Crear comunidad y cargar residentes</option>
                    <option>Cargar gastos comunes y pagos</option>
                    <option>Ordenar conserjeria y visitas</option>
                    <option>Implementar servicios y proveedores</option>
                    <option>Activar CoCo IA y WhatsApp</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8A8580]">
                    <Settings2 className="h-4 w-4" />
                    Documentos disponibles
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {documentOptions.map((item) => {
                      const checked = documents.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setDocuments(prev => checked ? prev.filter(doc => doc !== item) : [...prev, item])}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${checked ? "border-[#6E8268] bg-[#6E8268]/10 text-[#516A4F]" : "border-[#E4D8CA] bg-[#FAF7F1] text-[#6F665D]"}`}
                        >
                          <CheckCircle2 className={`h-4 w-4 ${checked ? "text-[#6E8268]" : "text-[#A39A91]"}`} />
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1A1611] px-5 py-4 text-sm font-bold text-white shadow-lg transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  Solicitar activacion inteligente
                </button>

                <div className="rounded-2xl border border-[#E4D8CA] bg-[#FAF7F1] p-4 text-sm leading-6 text-[#6F665D]">
                  ¿Ya quieres crear la cuenta y subir archivos ahora?{" "}
                  <Link href="/admin-onboarding" className="font-bold text-[#B45F4B] underline underline-offset-4">
                    Ir a Activacion Inteligente
                  </Link>
                </div>
              </form>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8A8580]">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
