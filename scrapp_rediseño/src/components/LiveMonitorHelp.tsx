import { Activity, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";

export default function LiveMonitorHelp() {
  return (
    <div className="space-y-6">
      {/* ¿Cómo funciona? */}
      <section className="rounded-lg border p-4" style={{ borderColor: "var(--border-color)" }}>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Activity className="h-5 w-5" style={{ color: "var(--primary)" }} />
          ¿Cómo funciona el monitoreo en vivo?
        </h3>
        <ol className="space-y-4">
          {[
            {
              t: "Captura Automática",
              d: "El sistema se conecta cada 30 segundos a la URL de transmisión y extrae el contenido visible (subtítulos/captions, título)."
            },
            {
              t: "Análisis de Texto",
              d: "Busca tus palabras clave configuradas. Si hay coincidencia, genera una mención."
            },
            {
              t: "Análisis de Sentimiento",
              d: "Clasifica cada mención como positiva, neutral o negativa según contexto."
            },
            {
              t: "Notificación Instantánea",
              d: "Te avisa en tiempo real cuando aparece una mención en la transmisión."
            },
            {
              t: "Gestión de Memoria",
              d: "Se conservan los últimos 100 fragmentos o la última hora para evitar acumulación."
            }
          ].map((it, i) => (
            <li key={i} className="flex gap-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: "var(--primary)" }}
              >
                {i + 1}
              </div>
              <div>
                <h4 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{it.t}</h4>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{it.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Información importante */}
      <section className="rounded-lg border p-4" style={{ borderColor: "var(--border-color)" }}>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <AlertCircle className="h-5 w-5" style={{ color: "var(--warning)" }} />
          Información Importante
        </h3>
        <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          <div className="flex gap-2"><CheckCircle className="h-5 w-5" style={{ color: "var(--success)" }} /><p><strong>Límite de fuentes:</strong> 1 transmisión activa para optimizar recursos.</p></div>
          <div className="flex gap-2"><CheckCircle className="h-5 w-5" style={{ color: "var(--success)" }} /><p><strong>Requisitos:</strong> la transmisión debe tener subtítulos/captions visibles.</p></div>
          <div className="flex gap-2"><CheckCircle className="h-5 w-5" style={{ color: "var(--success)" }} /><p><strong>Precisión:</strong> la calidad de los subtítulos impacta la detección.</p></div>
          <div className="flex gap-2"><Clock className="h-5 w-5" style={{ color: "var(--info)" }} /><p><strong>Tiempo de respuesta:</strong> detección en ≤ 30 s desde que ocurre en el stream.</p></div>
          <div className="flex gap-2"><XCircle className="h-5 w-5" style={{ color: "var(--danger)" }} /><p><strong>Limitación:</strong> no funciona con transmisiones con autenticación o paywall.</p></div>
        </div>
      </section>
    </div>
  );
}
