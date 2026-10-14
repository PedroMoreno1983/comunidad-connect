/**
 * Tipos de "Asambleas en línea" (Ley 21.442 y DS 7 de 2025).
 *
 * Viven aquí y no en `src/lib/types.ts` porque ese archivo supera el tamaño
 * publicable por la API de GitHub. Se importan desde `@/lib/assemblies/types`.
 */

/** Tipo de sesión (Ley 21.442, arts. 14 y 15). */
export type AssemblySessionType = 'ordinary' | 'extraordinary' | 'reinforced';
/** Modalidad (Ley 21.442, art. 16). */
export type AssemblyModality = 'in_person' | 'remote' | 'hybrid';
export type AssemblyStatus = 'draft' | 'cited' | 'in_progress' | 'closed' | 'minutes_signed' | 'cancelled';
/** Fila del cuadro del art. 15 a la que pertenece una materia. */
export type QuorumClass = 'ordinary' | 'absolute' | 'reinforced';
export type AgendaVotingStatus = 'pending' | 'open' | 'closed';
export type AgendaOutcome = 'approved' | 'rejected' | 'no_quorum';
export type AttendanceCapacity = 'owner' | 'proxy' | 'occupant';
export type AttendanceMode = 'in_person' | 'remote';
export type AttendanceStatus = 'confirmed' | 'present' | 'left';
export type VoteChoice = 'yes' | 'no' | 'abstain';
export type ProxyKind = 'proxy' | 'occupant_authorization' | 'occupant_opt_out';
export type ProxyStatus = 'pending' | 'accepted' | 'rejected' | 'revoked';
export type AssemblyTextSource = 'ai' | 'fallback' | 'manual';
export type RightsMethod = 'share' | 'equal';

export interface RightsUnit {
    unitId: string;
    label: string;
    /** Derechos de la unidad: alícuota en ‰ (share) o 1 (equal). */
    weight: number;
}

export interface RightsSnapshot {
    method: RightsMethod;
    units: RightsUnit[];
    total: number;
    warnings: string[];
}

export interface QuorumRuleText {
    constitution: string;
    agreement: string;
}

export interface VoteTally {
    yes: number;
    no: number;
    abstain: number;
    /** Derechos presentes y acreditados al cerrar la votación. */
    present: number;
    /** Derechos totales del condominio. */
    total: number;
}

export interface AgendaResult {
    tally: VoteTally;
    outcome: AgendaOutcome;
    /** Regla aplicada, en palabras, con el artículo. */
    rule: string;
    constitutionMet: boolean;
    agreementMet: boolean;
    /** Porcentajes redondeados para mostrar. */
    percentages: { presentOfTotal: number; yesOfBase: number; base: 'present' | 'total' };
    pendingVerification: number;
}

export interface AssemblyAgendaItem {
    id: string;
    position: number;
    matterCode: string;
    title: string;
    description: string;
    quorumClass: QuorumClass;
    requiresNotary: boolean;
    votingStatus: AgendaVotingStatus;
    outcome: AgendaOutcome | null;
    result: AgendaResult | null;
    notes: string;
}

export interface AssemblyRecord {
    id: string;
    title: string;
    sessionType: AssemblySessionType;
    modality: AssemblyModality;
    scheduledAt: string;
    location: string;
    videoUrl: string;
    status: AssemblyStatus;
    citationText: string;
    citationSource: AssemblyTextSource | null;
    citedAt: string | null;
    citationDate: string | null;
    requestReceivedOn: string | null;
    requestRightsShare: number | null;
    secretaryProfileId: string | null;
    notaryRequired: boolean;
    notaryName: string;
    rightsMethod: RightsMethod | null;
    rightsTotal: number | null;
    startedAt: string | null;
    closedAt: string | null;
    createdAt: string;
    updatedAt: string;
    items: AssemblyAgendaItem[];
}

export interface AssemblyAttendanceRow {
    id: string;
    unitId: string;
    unitLabel: string;
    weight: number;
    attendeeProfileId: string | null;
    attendeeName: string;
    capacity: AttendanceCapacity;
    proxyId: string | null;
    mode: AttendanceMode;
    status: AttendanceStatus;
    identityVerifiedAt: string | null;
    checkedInAt: string | null;
}

export interface AssemblyVoteRow {
    id: string;
    agendaItemId: string;
    unitId: string;
    choice: VoteChoice;
    weight: number;
    mode: AttendanceMode;
    identityVerifiedAt: string | null;
}

export interface AssemblyProxyRow {
    id: string;
    unitId: string;
    unitLabel: string;
    kind: ProxyKind;
    grantorProfileId: string | null;
    proxyProfileId: string | null;
    proxyName: string;
    coversReinforced: boolean;
    documentNote: string;
    status: ProxyStatus;
}

export interface AssemblyMinutes {
    id: string;
    content: string;
    source: AssemblyTextSource;
    status: 'draft' | 'signed';
    dueOn: string;
    signedAt: string | null;
    signers: string;
    edited: boolean;
}

export interface LiveQuorum {
    presentWeight: number;
    totalWeight: number;
    presentShare: number;
    presentUnits: number;
    totalUnits: number;
    constitutionMet: boolean;
    constitutionRule: string;
    pendingVerification: number;
}

export interface RepresentableUnit {
    unitId: string;
    label: string;
    capacity: AttendanceCapacity;
    proxyId: string | null;
}

export interface AssemblyAlert {
    level: 'info' | 'warning' | 'error';
    message: string;
}

export interface AssemblyView {
    assembly: AssemblyRecord;
    viewer: { role: 'admin' | 'secretary' | 'committee' | 'resident'; canManage: boolean; canVerify: boolean };
    alerts: AssemblyAlert[];
    rights: RightsSnapshot;
    quorum: LiveQuorum;
    /** Admin, secretaría y comité ven todo; un residente, solo lo de sus unidades. */
    attendance: AssemblyAttendanceRow[];
    votes: AssemblyVoteRow[];
    proxies: AssemblyProxyRow[];
    minutes: AssemblyMinutes | null;
    representable: RepresentableUnit[];
    minutesDeadline: { dueOn: string; daysLeft: number; overdue: boolean } | null;
}

export interface AssemblySummary {
    id: string;
    title: string;
    sessionType: AssemblySessionType;
    modality: AssemblyModality;
    scheduledAt: string;
    status: AssemblyStatus;
    itemCount: number;
    myRsvp: boolean;
}

export interface AssemblyMatter {
    code: string;
    quorumClass: QuorumClass;
    /** Numeral y letra del cuadro del art. 15 (p. ej. "2) c)"). */
    reference: string;
    label: string;
    requiresNotary: boolean;
    /** "Si la naturaleza del acuerdo lo requiere" (art. 15): se advierte, no se exige. */
    mayRequirePublicDeed: boolean;
}
