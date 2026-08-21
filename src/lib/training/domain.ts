export type TrainingLesson = {
    content: string;
};

export type TrainingCourse = {
    id: string;
    title: string;
    description: string;
    community_id?: string | null;
    training_lessons: TrainingLesson[];
};

export type TrainingProgressRecord = {
    module_id: string;
    status: 'in_progress' | 'completed';
    last_slide_index: number;
};
