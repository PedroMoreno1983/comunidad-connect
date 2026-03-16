const DRIVER_LABELS: Record<string, string> = {
  Absenteeism: "Ausentismo",
  "Low engagement": "Bajo engagement",
  "Tenure risk": "Riesgo de tenure",
  "Performance drop": "Caida de desempeno",
  "Promotion gap": "Brecha de crecimiento",
  Workload: "Sobrecarga",
  "Stress feedback": "Senales de estres",
};

const DRIVER_ACTIONS: Record<string, string> = {
  Absenteeism:
    "Revisar ausentismo reciente, flexibilidad operativa y soporte del manager antes de que escale a salida.",
  "Low engagement":
    "Abrir una conversacion de permanencia con el lider directo para validar expectativas, clima y ajuste de rol.",
  "Tenure risk":
    "Refuerza onboarding, claridad de objetivos y acompanamiento durante los primeros meses del colaborador.",
  "Performance drop":
    "Contrasta la caida de desempeno con carga, contexto del manager y prioridades del rol antes de activar una medida formal.",
  "Promotion gap":
    "Abrir una conversacion de desarrollo y siguiente paso de carrera para reducir sensacion de estancamiento.",
  Workload:
    "Rebalancear carga, prioridades y cobertura del equipo para bajar presion sostenida en el corto plazo.",
  "Stress feedback":
    "Profundizar en senales de estres y activar una rutina corta de seguimiento con liderazgo y People.",
};

const DEFAULT_ACTION =
  "Abrir una revision conjunta entre manager y People para confirmar causa raiz y definir accion correctiva.";

export function translateDriverLabel(label?: string | null) {
  if (!label) {
    return "Sin driver";
  }

  return DRIVER_LABELS[label] ?? label;
}

export function getDriverAction(label?: string | null) {
  if (!label) {
    return DEFAULT_ACTION;
  }

  return DRIVER_ACTIONS[label] ?? DEFAULT_ACTION;
}
