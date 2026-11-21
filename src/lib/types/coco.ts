export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id?: string; // Optional: null means global chat
  content: string;
  created_at: string;
  read?: boolean;
  profiles?: {
    name: string;
    avatar_url?: string;
  };
}

export interface Conversation {
  peerId: string;
  peerProfile: { name: string; avatar_url?: string };
  lastMessage: string;
  lastAt: string;
}

export interface ChatMessageSummary {
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export interface CocoCase {
  id: string;
  title: string;
  type?: string | null;
  category: string;
  urgency: 'baja' | 'media' | 'alta' | 'emergencia';
  action?: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  reason?: string | null;
  source_message: string;
  assistant_reply?: string | null;
  unit_label?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CocoCaseEvent {
  id: string;
  case_id: string;
  event_type: 'created' | 'status_changed' | 'comment' | 'system';
  from_status: string | null;
  to_status: string | null;
  body: string | null;
  actor_role: string | null;
  created_at: string;
}

/** Temas de las consultas a CoCo, para los datos agregados de la administración. */
export type CocoTopicKey = 'gastos_comunes' | 'reservas' | 'mantencion' | 'convivencia' | 'seguridad_accesos' | 'estacionamientos_bodegas' | 'asambleas_votaciones' | 'reglamento_legal' | 'compras_marketplace' | 'otros';

/** Uso de CoCo en la comunidad, agregado y sin identificar a nadie (null: muy pocas personas para mostrarlo). */
export interface CocoInsights {
  days: number;
  minPeople: number;
  residents: number | null;
  messages: number | null;
  whatsappShare: number | null;
  topics: Array<{ topic: CocoTopicKey; label: string; messages: number; people: number }>;
  hiddenTopics: number;
}

export type CocoConsentState = 'granted' | 'withdrawn' | 'unknown';

/** Vecino que entró sin código y espera que la administración lo valide. */
export type PendingResident = { id: string; name: string; email: string; departmentNumber: string; createdAt: string };

// ─── CoCo en el chat del residente ──────────────────────────────────────────

export interface CoCoPendingAction {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
    title: string;
    summary: string;
    /** Enlace temporal a la imagen que se va a guardar (save_provider_attachment). */
    previewUrl?: string;
}

/** Resoluciones del usuario a una tanda de acciones pendientes, por tool_use_id. */
export type CoCoResolutions = Record<string, 'approved' | 'rejected'>;

/** Lo que `/api/coco` devuelve al navegador. */
export interface CoCoApiResponse {
    reply?: string;
    navigate?: string;
    /** La persona pidió ir ("llévame ahí"): el chat navega sin esperar el clic. */
    autoNavigate?: boolean;
    action?: string;
    pendingActions?: CoCoPendingAction[];
    /** Cuánto le queda a la persona de su cupo de CoCo, en %. */
    allowance?: CoCoAllowance;
}

export interface CoCoAllowance {
    dailyLeftPct: number;
    weeklyLeftPct: number;
}

export interface CoCoChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    imageBase64?: string;
    nav?: string;
    action?: string;
    pendingActions?: CoCoPendingAction[];
    resolvedActions?: CoCoResolutions;
}

export interface CoCoThread {
    id: string;
    title: string;
    updatedAt: string;
    /** Fijada por la persona: va arriba y no vence. */
    pinned?: boolean;
    /** Sin mensajes todavía. */
    empty?: boolean;
}

/** Conversaciones agrupadas para la lista lateral (Fijadas, Hoy, Ayer…). */
export interface CoCoThreadGroup {
    label: string;
    threads: CoCoThread[];
}

export interface CoCoThreadSidebarProps {
    threads: CoCoThread[];
    activeId: string | null;
    disabled: boolean;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onRename: (id: string, title: string) => void;
    onTogglePin: (id: string, pinned: boolean) => void;
    onDelete: (id: string) => void;
}

export interface AgentCollectionExpense {
    id: string;
    unit_id: string | null;
    month: string | null;
    amount: number;
    status: string;
    due_date: string | null;
    source?: 'expense' | 'charge';
    label?: string | null;
}

export type AgentCollectionStage = 'reminder' | 'second_notice' | 'agreement';

export interface AgentCollectionNotification {
    id: string;
    user_id: string;
    type: string;
    category: string;
    title: string;
    body: string;
    link: string;
    community_id: string;
}

export interface AgentCollectionPlan {
    notifications: AgentCollectionNotification[];
    adminNotifications?: AgentCollectionNotification[];
    missingRecipients: { expenseId: string; unitId: string | null; unitLabel: string; reason: string }[];
    recipientCount: number;
    agreementCandidates?: { unitId: string; unitLabel: string; daysOverdue: number }[];
    skippedWithAgreement?: number;
}

export interface AgentCollectionUnit {
    id: string;
    number: string | null;
    unit_number: string | null;
    owner_id: string | null;
    resident_profile_id: string | null;
}

/** Resultado de guardar una imagen del chat para usarla en el perfil de un maestro. */
export type ChatAttachmentStash = { status: 'stored'; id: string } | { status: 'unsupported' } | { status: 'failed' };

/** Lo guardado en la sesión del chat: el resultado y cuándo se adjuntó. */
export type ChatAttachmentState = ChatAttachmentStash & { at: string };
