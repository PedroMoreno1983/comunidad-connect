import { datasetSchema, type DatasetKey, type FileType } from "@/lib/validations/ingestion";

export type DatasetField = {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "date" | "number";
  description: string;
  sampleHeaders: string[];
};

export type DatasetDefinition = {
  key: DatasetKey;
  label: string;
  description: string;
  persistenceNote: string;
  supportedFileTypes: FileType[];
  fields: DatasetField[];
};

const datasetDefinitions: Record<DatasetKey, DatasetDefinition> = {
  employees: {
    key: "employees",
    label: "Empleados",
    description: "Crea o actualiza empleados y areas a partir de archivos de dotacion normalizados.",
    persistenceNote: "Crea areas faltantes y actualiza empleados existentes por codigo externo dentro de la empresa seleccionada.",
    supportedFileTypes: ["csv", "xlsx"],
    fields: [
      { key: "externalCode", label: "Codigo externo", required: true, type: "string", description: "Identificador estable del colaborador desde el HRIS.", sampleHeaders: ["employee_id", "external_code", "employee_code", "code"] },
      { key: "firstName", label: "Nombre", required: true, type: "string", description: "Nombre del colaborador.", sampleHeaders: ["first_name", "name", "given_name"] },
      { key: "lastName", label: "Apellido", required: true, type: "string", description: "Apellido del colaborador.", sampleHeaders: ["last_name", "surname", "family_name"] },
      { key: "hireDate", label: "Fecha de ingreso", required: true, type: "date", description: "Fecha de inicio del colaborador.", sampleHeaders: ["hire_date", "start_date", "admission_date"] },
      { key: "departmentName", label: "Area", required: true, type: "string", description: "Nombre del area o equipo.", sampleHeaders: ["department", "department_name", "team", "area"] },
      { key: "managerExternalCode", label: "Codigo de manager", required: false, type: "string", description: "Codigo externo del manager si existe.", sampleHeaders: ["manager_id", "manager_code", "reports_to"] },
      { key: "jobTitle", label: "Cargo", required: false, type: "string", description: "Titulo del rol.", sampleHeaders: ["job_title", "title", "position", "role"] },
      { key: "jobLevel", label: "Nivel", required: false, type: "string", description: "Nivel o seniority.", sampleHeaders: ["job_level", "level", "seniority"] },
      { key: "contractType", label: "Tipo de contrato", required: false, type: "string", description: "Tipo de contrato laboral.", sampleHeaders: ["contract_type", "contract"] },
      { key: "location", label: "Ubicacion", required: false, type: "string", description: "Oficina principal o ciudad.", sampleHeaders: ["location", "office", "city"] },
      { key: "workMode", label: "Modalidad", required: false, type: "string", description: "Presencial, hibrido o remoto.", sampleHeaders: ["work_mode", "modality", "work_type"] },
      { key: "ageBand", label: "Rango etario", required: false, type: "string", description: "Tramo de edad.", sampleHeaders: ["age_band", "age_group"] },
      { key: "gender", label: "Genero", required: false, type: "string", description: "Genero informado por el sistema fuente.", sampleHeaders: ["gender", "sex"] },
      { key: "terminationDate", label: "Fecha de salida", required: false, type: "date", description: "Fecha de termino si el colaborador salio.", sampleHeaders: ["termination_date", "end_date", "termination"] }
    ]
  },
  absences: {
    key: "absences",
    label: "Ausencias",
    description: "Carga eventos de ausencia y los vincula a empleados existentes.",
    persistenceNote: "Requiere empleados existentes en la empresa seleccionada y deduplica por empleado, fecha, dias y tipo.",
    supportedFileTypes: ["csv", "xlsx"],
    fields: [
      { key: "employeeExternalCode", label: "Codigo de empleado", required: true, type: "string", description: "Identificador del colaborador usado en la dotacion.", sampleHeaders: ["employee_id", "external_code", "employee_code"] },
      { key: "date", label: "Fecha de ausencia", required: true, type: "date", description: "Fecha del evento de ausencia.", sampleHeaders: ["date", "absence_date"] },
      { key: "days", label: "Dias", required: true, type: "number", description: "Cantidad de dias ausentes.", sampleHeaders: ["days", "days_absent"] },
      { key: "type", label: "Tipo", required: false, type: "string", description: "Tipo o categoria de ausencia.", sampleHeaders: ["type", "absence_type", "category"] }
    ]
  },
  performance: {
    key: "performance",
    label: "Evaluaciones de desempeno",
    description: "Carga snapshots de evaluacion de desempeno para empleados existentes.",
    persistenceNote: "Actualiza o crea registros de evaluacion por empleado y fecha de revision.",
    supportedFileTypes: ["csv", "xlsx"],
    fields: [
      { key: "employeeExternalCode", label: "Codigo de empleado", required: true, type: "string", description: "Identificador del colaborador usado en la dotacion.", sampleHeaders: ["employee_id", "external_code", "employee_code"] },
      { key: "reviewDate", label: "Fecha de evaluacion", required: true, type: "date", description: "Fecha de la evaluacion.", sampleHeaders: ["review_date", "evaluation_date"] },
      { key: "score", label: "Puntaje", required: true, type: "number", description: "Puntaje numerico de desempeno.", sampleHeaders: ["score", "rating", "performance_score"] },
      { key: "reviewer", label: "Evaluador", required: false, type: "string", description: "Nombre o identificador del evaluador.", sampleHeaders: ["reviewer", "reviewed_by"] }
    ]
  },
  promotions: {
    key: "promotions",
    label: "Promociones",
    description: "Carga eventos de promocion para empleados existentes.",
    persistenceNote: "Actualiza o crea promociones por empleado y fecha efectiva para que el scoring de brecha de promocion se base en datos importados.",
    supportedFileTypes: ["csv", "xlsx"],
    fields: [
      { key: "employeeExternalCode", label: "Codigo de empleado", required: true, type: "string", description: "Identificador del colaborador usado en la dotacion.", sampleHeaders: ["employee_id", "external_code", "employee_code"] },
      { key: "effectiveAt", label: "Fecha efectiva", required: true, type: "date", description: "Fecha en que la promocion se hizo efectiva.", sampleHeaders: ["effective_at", "promotion_date", "effective_date"] },
      { key: "oldLevel", label: "Nivel anterior", required: false, type: "string", description: "Nivel previo a la promocion.", sampleHeaders: ["old_level", "from_level", "previous_level"] },
      { key: "newLevel", label: "Nuevo nivel", required: false, type: "string", description: "Nivel posterior a la promocion.", sampleHeaders: ["new_level", "to_level", "current_level"] }
    ]
  },
  surveys: {
    key: "surveys",
    label: "Respuestas de encuesta",
    description: "Carga respuestas de encuesta asociadas a empleados y dimensiones.",
    persistenceNote: "Crea o reutiliza encuestas por empresa y nombre, y luego hace upsert de respuestas por dimension.",
    supportedFileTypes: ["csv", "xlsx"],
    fields: [
      { key: "surveyName", label: "Nombre de encuesta", required: true, type: "string", description: "Nombre del pulso o encuesta.", sampleHeaders: ["survey_name", "pulse_name", "survey"] },
      { key: "surveyCreatedAt", label: "Fecha de encuesta", required: false, type: "date", description: "Fecha de creacion o levantamiento de la encuesta.", sampleHeaders: ["survey_date", "created_at", "pulse_date"] },
      { key: "employeeExternalCode", label: "Codigo de empleado", required: true, type: "string", description: "Identificador del colaborador usado en la dotacion.", sampleHeaders: ["employee_id", "external_code", "employee_code"] },
      { key: "dimension", label: "Dimension", required: true, type: "string", description: "Dimension de la encuesta, como engagement o carga.", sampleHeaders: ["dimension", "question_group", "topic"] },
      { key: "score", label: "Puntaje", required: true, type: "number", description: "Puntaje numerico de la respuesta.", sampleHeaders: ["score", "value", "response_score"] }
    ]
  }
};

export const ingestionDatasets = datasetSchema.options.map(
  (key) => datasetDefinitions[key],
);

export function getDatasetDefinition(dataset: DatasetKey) {
  return datasetDefinitions[dataset];
}
