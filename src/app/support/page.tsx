import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, Mail, MessageCircle, Shield, Smartphone } from "lucide-react";
import { SUPPORT_EMAIL, WHATSAPP_WEBHOOK_PATH } from "@/lib/config";

export const metadata = {
  title: "Soporte",
  description: "Canales de soporte y activacion para administradores, residentes y conserjeria de Convive Connect.",
  alternates: { canonical: "/support" },
};

const supportLanes = [
  {
    title: "Administracion",
    detail: "Onboarding, carga masiva, finanzas, votaciones, usuarios y reportes operativos.",
    response: "Prioridad alta en horario habil.",
  },
  {
    title: "Residentes",
    detail: "Acceso, pagos, reservas, notificaciones, WhatsApp y convivencia vecinal.",
    response: "Respuesta segun SLA de comunidad.",
  },
  {
    title: "Conserjeria",
    detail: "Visitas, paquetes, avisos urgentes, bitacora y derivacion de casos CoCo.",
    response: "Canal operativo para turnos.",
  },
];

export default function SupportPage() {
  const whatsappWebhook = `https://conviveconnect.com${WHATSAPP_WEBHOOK_PATH}`;

  return (
    <main className="min-h-screen bg-[#FBF8F1] px-5 py-10 text-[#1A1611] md:px-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#B45F4B] hover:text-[#974C3C]">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>

        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8A8580]">Soporte Convive</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-semibold leading-none md:text-6xl">
              Ayuda real para operar tu comunidad.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#524A40]">
              Centralizamos soporte comercial, tecnico y operativo para que cada edificio tenga una ruta clara:
              resolver incidencias, activar WhatsApp, cuidar datos personales y escalar solo cuando corresponde.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E4D8CA] bg-white/70 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#B45F4B] text-white">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold">Contacto directo</p>
                <a className="text-sm font-semibold text-[#B45F4B]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm text-[#524A40]">
              <p className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 text-[#B45F4B]" /> Recepcion y triage por prioridad operacional.</p>
              <p className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 text-[#5F7A46]" /> Tratamiento de datos con finalidad, minimizacion y acceso por rol.</p>
              <p className="flex gap-2"><Smartphone className="mt-0.5 h-4 w-4 text-[#5C4868]" /> Activacion guiada de CoCo IA por WhatsApp.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {supportLanes.map((lane) => (
            <div key={lane.title} className="rounded-2xl border border-[#E4D8CA] bg-white/70 p-6 shadow-sm">
              <CheckCircle2 className="h-5 w-5 text-[#5F7A46]" />
              <h2 className="mt-4 text-xl font-semibold">{lane.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#524A40]">{lane.detail}</p>
              <p className="mt-4 rounded-lg bg-[#F5EFE6] px-3 py-2 text-xs font-semibold text-[#8A8580]">{lane.response}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-[#D9CABA] bg-[#111827] p-6 text-white shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">WhatsApp</p>
              <h2 className="mt-2 text-2xl font-semibold">Webhook de CoCo IA</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/70">
                En Twilio, configura el sandbox o numero aprobado con metodo POST apuntando a este endpoint.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-white/80">
              {whatsappWebhook}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Activar WhatsApp Convive`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#111827]">
              Solicitar activacion <MessageCircle className="h-4 w-4" />
            </a>
            <Link href="/privacy" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white">
              Ver privacidad
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
