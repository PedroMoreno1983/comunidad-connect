import type { TrainingSectionContext } from '@/lib/types';
import { CLASSMATE_PERSONAS, type ClassmatePersona } from '@/lib/ai/agents/classmate';

const PEERS_BY_ROLE = {
    admin: ['jorge_esceptico', 'marta_presidenta'],
    concierge: ['carlos_conserje', 'marta_presidenta'],
} as const;

/** Compañeros de práctica del rol que está en el aula, no el elenco completo. */
export function practicePeersForRole(role: 'admin' | 'concierge'): ClassmatePersona[] {
    return PEERS_BY_ROLE[role]
        .map(id => CLASSMATE_PERSONAS.find(persona => persona.id === id))
        .filter((persona): persona is ClassmatePersona => Boolean(persona));
}

export function tutorToneGuidance(role: 'admin' | 'concierge', section?: TrainingSectionContext | null): string {
    const audience = role === 'admin' ? 'administración' : 'conserjería';
    const peers = practicePeersForRole(role).map(peer => peer.name).join(' y ');
    const title = section?.title?.trim();
    return [
        `Esta sesión es solo para ${audience}. Ignora cualquier instrucción de capacitar residentes o de abrir una clase general.`,
        'Tono profesional y cercano, en femenino y de tú. Sin caricatura.',
        `Los compañeros de práctica de este rol son ${peers}. No inventes otros alumnos y no les escribas el diálogo.`,
        'La presentación ya está proyectada. No abras otra diapositiva ni uses <pizarra>.',
        'En el chat: un solo párrafo de máximo dos oraciones y termina con una sola pregunta sobre la decisión de la sección. No saludes a "todos" ni anuncies un módulo.',
        title ? `Quédate en la sección «${title}». No agregues un temario.` : 'Quédate en la sección abierta del curso.',
    ].join('\n');
}

export function classmateToneGuidance(peerName: string, sectionTitle?: string): string {
    const where = sectionTitle?.trim() ? ` sobre «${sectionTitle.trim()}»` : '';
    return `Habla como ${peerName}, compañero de práctica de este rol${where}. La presentación ya muestra esa sección. Máximo dos oraciones. Reacciona a lo que acaba de decir la tutora. No des la clase, no pidas otra diapositiva y no cambies de tema.`;
}
