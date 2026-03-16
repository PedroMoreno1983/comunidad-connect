import {
  CheckCircle2,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { IngestionWorkbench } from "@/components/ingestion-workbench";
import { Badge } from "@/components/ui/badge";
import { ingestionDatasets } from "@/lib/ingestion/datasets";
import { cn } from "@/lib/utils";

const datasetSurface = [
  "border-[#cfd9e4] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,246,250,0.92))]",
  "border-[#dfd4be] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,247,239,0.92))]",
  "border-[#d7d2e5] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,242,250,0.92))]",
  "border-[#cfe1da] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,250,246,0.92))]",
  "border-[#e5d6d1] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,243,240,0.92))]",
  "border-[#d3dce6] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,247,250,0.92))]",
];

function CapabilityCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileSpreadsheet;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,248,250,0.92))] p-6 shadow-[0_22px_60px_-44px_rgba(15,23,42,0.42)]">
      <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-3 text-slate-700">
        <Icon className="size-5" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
    </div>
  );
}

function FlowStep({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white/88 p-5 shadow-[0_20px_56px_-44px_rgba(15,23,42,0.36)]">
      <div className="flex items-center gap-3">
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {index}
        </div>
        <p className="text-lg font-semibold text-slate-950">{title}</p>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
    </div>
  );
}

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[38px] border border-[#17314f]/12 bg-[radial-gradient(circle_at_top_left,rgba(35,87,133,0.24),transparent_32%),radial-gradient(circle_at_82%_20%,rgba(92,147,142,0.16),transparent_22%),linear-gradient(135deg,rgba(249,247,242,0.98)_0%,rgba(239,244,247,0.98)_52%,rgba(255,255,255,1)_100%)] p-8 shadow-[0_38px_120px_-54px_rgba(16,33,60,0.72)] lg:p-10">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="min-w-0">
            <Badge variant="neutral">Carga gobernada</Badge>

            <div className="mt-8 max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Confiabilidad del producto
              </p>
              <h1 className="mt-4 font-serif text-5xl font-semibold tracking-tight text-slate-950 lg:text-6xl">
                La analitica se vende mejor cuando la carga de datos transmite
                control, trazabilidad y seriedad.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
                Este espacio ya no parece un importador tecnico. Se presenta como una
                frontera de gobierno de datos: preview, mapeo, validacion, historial,
                templates y persistencia en un flujo listo para una demo comercial.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Datasets soportados",
                  value: String(ingestionDatasets.length),
                },
                {
                  label: "Formatos de entrada",
                  value: "CSV / XLSX",
                },
                {
                  label: "Re-ejecucion analytics",
                  value: "Automatica",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[28px] border border-white/70 bg-white/72 p-5 backdrop-blur shadow-[0_24px_60px_-44px_rgba(15,23,42,0.6)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-4 font-serif text-3xl font-semibold text-slate-950">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[32px] border border-[#17314f]/10 bg-[linear-gradient(180deg,#10213c_0%,#17314f_58%,#1d4465_100%)] p-6 text-white shadow-[0_30px_80px_-42px_rgba(16,33,60,0.88)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                    Senal de producto
                  </p>
                  <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight">
                    No solo importamos archivos.
                  </h2>
                </div>
                <Sparkles className="size-5 text-slate-300" />
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                La narrativa correcta para socios y clientes es esta: DataWise unifica
                la entrada de datos con la salida analitica, y cada carga deja una
                historia auditada detras.
              </p>
            </div>

            <div className="rounded-[32px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_26px_80px_-46px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Que ya muestra la demo
              </p>
              <div className="mt-5 space-y-3">
                {[
                  "Preview antes de persistir",
                  "Contrato de mapeo por dataset",
                  "Templates listos para onboarding",
                  "Auditoria visible de cada corrida",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                  >
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <CapabilityCard
          icon={FileSpreadsheet}
          title="Archivos fuente"
          description="CSV y XLSX estan soportados para cargas gobernadas de datos de RR.HH. y demos con onboarding mas ordenado."
        />
        <CapabilityCard
          icon={ShieldCheck}
          title="Validacion"
          description="Cada campo cruza una frontera de schema antes de persistirse, lo que hace que la demo se vea seria y productizable."
        />
        <CapabilityCard
          icon={Workflow}
          title="Trazabilidad"
          description="Cada corrida deja archivo, estado, volumen e issues visibles para responder preguntas de negocio y de operacion."
        />
      </section>

      <section className="rounded-[34px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.5)] lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Cobertura actual
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              Datasets listos para una historia comercial completa.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              En vez de una tabla fria, esta vista deja claro que cada dataset tiene
              un rol dentro de la historia del producto y un comportamiento de
              persistencia conocido.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
            {ingestionDatasets.length} datasets activos
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {ingestionDatasets.map((item, index) => (
            <div
              key={item.key}
              className={cn(
                "rounded-[28px] border p-5 shadow-[0_20px_56px_-44px_rgba(15,23,42,0.38)]",
                datasetSurface[index % datasetSurface.length],
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold text-slate-950">{item.label}</h3>
                  <Badge variant="neutral">{item.key}</Badge>
                </div>
                <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {item.supportedFileTypes.map((fileType) => fileType.toUpperCase()).join(" / ")}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">{item.description}</p>
              <div className="mt-5 rounded-[22px] border border-slate-200 bg-white/76 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Persistencia
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{item.persistenceNote}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <FlowStep
          index="01"
          title="Preview"
          description="Primero se parsea el archivo y se expone una muestra visible, para que la demo arranque con confianza y no con ceguera."
        />
        <FlowStep
          index="02"
          title="Mapeo y validacion"
          description="El contrato de campos deja claro que se importa, que falta y que campos son realmente obligatorios."
        />
        <FlowStep
          index="03"
          title="Persistencia y auditoria"
          description="La corrida deja historial, resultados e issues, y luego refresca analytics para cerrar el circulo del producto."
        />
      </section>

      <section className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,248,250,0.94))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] lg:p-7">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Workbench
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
            Flujo de carga controlado y listo para mostrar en una demo.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Aqui queda el producto real: subir, revisar, mapear, validar, persistir y
            refrescar analytics sin salir de una sola superficie.
          </p>
        </div>

        <div className="mt-6 rounded-[30px] border border-slate-200/80 bg-white/82 p-3 shadow-[0_20px_56px_-44px_rgba(15,23,42,0.34)]">
          <IngestionWorkbench />
        </div>
      </section>
    </div>
  );
}
