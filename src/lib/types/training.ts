// ─── Aula virtual ───────────────────────────────────────────────────────────

export interface TrainingLesson {
    id: string;
    title: string;
    content: string;
    order_index: number;
}

export type TrainingActivityType = 'knowledge_check' | 'scenario' | 'checklist';

export type TrainingSlideLayout = 'opening' | 'framework' | 'process' | 'comparison' | 'scenario' | 'checklist' | 'summary';

export interface TrainingRoleCard {
    role: string;
    responsibility: string;
    action: string;
}

export interface TrainingActivity {
    type: TrainingActivityType;
    prompt: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
    items?: string[];
}

export interface TrainingSlide {
    id: string;
    title: string;
    eyebrow?: string;
    lead?: string;
    bullets: string[];
    layout: TrainingSlideLayout;
    role_cards?: TrainingRoleCard[];
    source_note?: string;
    visual_theme: 'copper' | 'sage' | 'ink' | 'amber';
    notes: string;
    activity?: TrainingActivity;
}

/** Sección que el respaldo del aula usa cuando el motor de IA no responde. */
export type TrainingSectionContext = Pick<TrainingSlide, 'title' | 'lead' | 'bullets' | 'notes'>;

export interface TrainingQualityCheck {
    id: string;
    label: string;
    passed: boolean;
    points: number;
}

export interface TrainingQualityReport {
    score: number;
    publishable: boolean;
    checks: TrainingQualityCheck[];
}

export interface TrainingChatMessage {
    id: string;
    role: 'tutor' | 'classmate' | 'user' | 'system';
    text: string;
    blackboard?: string;
    name?: string;
}

export interface TrainingModule {
    id: string;
    title: string;
    description: string;
    target_audience?: string | null;
    is_active?: boolean | null;
    community_id?: string | null;
    created_at?: string | null;
    embed_url?: string | null;
    learning_objectives?: string[] | null;
    estimated_minutes?: number | null;
    quality_version?: number | null;
    quality_score?: number | null;
    version_number?: number | null;
    completion_mode?: 'interactive' | 'embed_post_message' | 'embed_manual' | null;
    embed_allowed_origin?: string | null;
    published_at?: string | null;
    updated_at?: string | null;
    training_lessons: TrainingLesson[];
}

export interface TrainingCourseDraft {
    title: string;
    description: string;
    targetAudience: 'all' | 'admin' | 'concierge';
    content: string;
    embedUrl: string;
    completionMode: 'interactive' | 'embed_post_message' | 'embed_manual';
    learningObjectives: string[];
    estimatedMinutes: number;
    changeSummary: string;
}

export interface TrainingCourseBuilderProps {
    onPublished: (course: TrainingModule) => void;
    onCancel: () => void;
    initialCourse?: TrainingModule | null;
}

export type TrainingViewMode = 'catalog' | 'create' | 'edit' | 'compliance';

export interface TrainingGenerateResponse {
    slides?: TrainingSlide[];
    quality?: TrainingQualityReport;
    warning?: string;
    error?: string;
}

export interface TrainingModuleMutationResponse {
    module?: TrainingModule;
    error?: string;
}

export interface TrainingClassroomProps {
    moduleId: string;
    moduleVersion: number;
    courseContent?: string;
    courseTitle?: string;
    learningObjectives?: string[];
    estimatedMinutes?: number;
    initialSlideIndex?: number;
    onSlideChange?: (index: number) => void;
    onComplete?: (result: TrainingCompletionResult) => void;
}

export interface TrainingProgressRecord {
    module_id: string;
    status: 'in_progress' | 'completed';
    last_slide_index: number;
    started_at?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
}

export interface TrainingAssignmentRecord {
    id: string;
    module_id: string;
    user_id: string;
    community_id: string;
    assigned_by?: string | null;
    module_version: number;
    mandatory: boolean;
    due_at?: string | null;
    status: 'assigned' | 'in_progress' | 'completed' | 'cancelled';
    assigned_at: string;
    completed_at?: string | null;
    updated_at: string;
    user?: TrainingStaffMember | null;
    module?: Pick<TrainingModule, 'id' | 'title' | 'target_audience'> | null;
    latest_attempt?: TrainingAttemptRecord | null;
}

export interface TrainingStaffMember {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'concierge';
}

export interface TrainingActivityResponseRecord {
    id: string;
    attempt_id: string;
    slide_id: string;
    activity_type: TrainingActivityType;
    response_number: number;
    answer: number | string[] | Record<string, unknown>;
    is_correct: boolean;
    score: number;
    responded_at: string;
}

export interface TrainingCertificateRecord {
    id: string;
    attempt_id: string;
    module_id: string;
    user_id: string;
    community_id: string;
    certificate_number: string;
    issued_at: string;
    revoked_at?: string | null;
}

export interface TrainingAttemptRecord {
    id: string;
    module_id: string;
    user_id: string;
    community_id: string;
    assignment_id?: string | null;
    module_version: number;
    attempt_number: number;
    status: 'in_progress' | 'completed';
    score?: number | null;
    passed?: boolean | null;
    completion_source: 'interactive' | 'embed_post_message' | 'legacy';
    embed_nonce?: string;
    started_at: string;
    completed_at?: string | null;
    updated_at: string;
    responses?: TrainingActivityResponseRecord[];
    certificate?: TrainingCertificateRecord | null;
}

export interface TrainingAttemptResponse {
    attempt?: TrainingAttemptRecord;
    response?: TrainingActivityResponseRecord;
    feedback?: string;
    certificate?: TrainingCertificateRecord;
    error?: string;
}

export interface TrainingRetentionCheck {
    id: string;
    attempt_id: string;
    slide_id: string;
    is_correct: boolean;
    responded_at: string;
}

export interface TrainingRetentionResponse {
    eligible_at: string;
    eligible: boolean;
    checks: TrainingRetentionCheck[];
    check?: TrainingRetentionCheck;
    error?: string;
}

export interface TrainingRetentionReviewProps {
    attemptId: string;
    slides: TrainingSlide[];
}

export interface TrainingCompletionResult {
    attempt: TrainingAttemptRecord;
    certificate: TrainingCertificateRecord;
}

export interface EmbeddedTrainingPlayerProps {
    course: TrainingModule;
    onComplete?: (result: TrainingCompletionResult) => void;
}

export interface TrainingComplianceSummary {
    assigned: number;
    completed: number;
    inProgress: number;
    overdue: number;
    completionRate: number;
}

export interface TrainingComplianceDashboard {
    summary: TrainingComplianceSummary;
    staff: TrainingStaffMember[];
    assignments: TrainingAssignmentRecord[];
    versions: Array<{
        id: string;
        module_id: string;
        version_number: number;
        change_summary: string;
        quality_score: number;
        created_at: string;
        created_by?: string | null;
    }>;
    learning: Array<{
        module_id: string;
        firstTryCorrect: number;
        firstTryTotal: number;
        delayedCorrect: number;
        delayedTotal: number;
    }>;
}

export interface TrainingAssignmentMutationResponse {
    assignments?: TrainingAssignmentRecord[];
    error?: string;
}

export interface TrainingCompliancePanelProps {
    courses: TrainingModule[];
    onBack: () => void;
}
