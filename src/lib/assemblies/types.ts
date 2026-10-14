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
    /** Totales del certificado de habilidad (nunca qué unidades). null si aún no se emite. */
    eligibility: EligibilityCertificate | null;
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
    /** Estado de habilidad de las unidades que representa quien mira (solo las suyas). */
    myEligibility: MyEligibility[];
    /**
     * Solo para administración, que conduce y acredita: unidades no habilitadas
     * para votar ("asiste con voz"). Se muestra en el formulario de acreditación,
     * nunca en pantallas compartidas ni en el acta. null para cualquier otro rol.
     */
    conductor: { ineligibleUnitIds: string[]; certified: boolean } | null;
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

// ---------------------------------------------------------------------------
// Copropietarios hábiles (Ley 21.442, arts. 2 N°13, 6 y 15; DS 7, arts. 9 y 14)
// ---------------------------------------------------------------------------

/**
 * Por qué una unidad quedó (o no) habilitada. Solo lo ve administración: la
 * unidad ve "puede votar" o "para votar, ponte al día o conversa un convenio",
 * y las pantallas compartidas y el acta, solo totales.
 */
export type EligibilityBasis =
    | 'up_to_date'          // sin saldo vencido a la fecha de corte
    | 'agreement'           // convenio vigente y al día (DS 7, art. 9)
    | 'overdue'             // saldo vencido a la fecha de corte
    | 'agreement_lapsed'    // convenio con cuotas vencidas, o sin la primera cuota pagada
    | 'other_unit';         // el mismo copropietario tiene otra unidad no habilitada (DS 7, art. 14)

/** Cobro sin pagar de la cobranza unificada (expenses + unit_charges). */
export interface EligibilityDebt {
    unitId: string;
    dueDate: string | null;
    status: string;
}

export interface EligibilityAgreement {
    unitId: string;
    status: string;
    /** Fecha (YYYY-MM-DD o ISO) en que se suscribió el convenio. */
    createdAt: string;
    installments: { sequence: number; dueDate: string; status: string }[];
}

export interface EligibilityUnitInput {
    unitId: string;
    ownerId: string | null;
    weight: number;
}

export interface UnitEligibility {
    unitId: string;
    eligible: boolean;
    basis: EligibilityBasis;
    weight: number;
}

export interface EligibilityTotals {
    cutoffDate: string;
    totalUnits: number;
    eligibleUnits: number;
    totalWeight: number;
    eligibleWeight: number;
}

export interface EligibilityResult extends EligibilityTotals {
    units: UnitEligibility[];
}

/** Certificado de habilidad: solo totales. El detalle por unidad queda aparte, solo para admin. */
export interface EligibilityCertificate extends EligibilityTotals {
    id: string;
    rightsMethod: RightsMethod;
    issuedAt: string;
    issuedByName: string;
    eligibleShare: number;
}

/** Lo que ve una unidad de sí misma: nada más que si puede votar. */
export interface MyEligibility {
    unitId: string;
    label: string;
    eligible: boolean;
    /** true: sale del certificado emitido; false: estimación previa a la fecha de corte. */
    certified: boolean;
}
