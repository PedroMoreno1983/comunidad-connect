import { searchPlatformMap } from './platformMap';
import { getSafeCoCoNavigation } from './navigation';

/**
 * "Llévame ahí" tiene que llevar. El modelo a veces responde "te llevo" sin
 * escribir NAVEGAR:/ruta, y la persona se queda donde estaba. Esto deduce el
 * destino del propio mensaje ("llévame al supermercado") o, si el mensaje solo
 * apunta ("ahí", "eso", "ábrelo"), de lo último que dijo CoCo.
 */

// Solo pedidos explícitos de ir a una pantalla. "Abre el portón" es una acción
// del citófono, no navegación: por eso "abre" a secas no cuenta.
const GO_INTENT = /(^|[^\p{L}])(ll[eé]v[aá]me|ll[eé]vanos|ir\s+a(l)?\s|vamos\s+a(l)?\s|quiero\s+ir|[aá]br[eí](lo|la)|m[uú][eé]stra(me)?\s+la\s+(pantalla|secci[oó]n|p[aá]gina))/iu;
// "Ahí", "allá", "eso" o un pronombre pegado ("ábrelo"). "La" y "lo" sueltos son
// artículos: "vamos a la reunión" no apunta a lo último que dijo CoCo.
const DEICTIC = /(^|[^\p{L}])(ah[ií]|all[aá]|eso)([^\p{L}]|$)|[aá]br[eí](lo|la)([^\p{L}]|$)/iu;

export function isGoIntent(message: string): boolean {
    return GO_INTENT.test(message);
}

/** Ruta permitida a la que apunta el pedido, o undefined si no hay una clara. */
export function inferNavigation(message: string, recentAssistantTexts: string[], role: string | null | undefined): string | undefined {
    if (!isGoIntent(message)) return undefined;
    const direct = searchPlatformMap(message, role, 1)[0];
    const fromMessage = direct ? getSafeCoCoNavigation(direct.route) : undefined;
    if (fromMessage) return fromMessage;
    if (!DEICTIC.test(message)) return undefined;
    for (const text of recentAssistantTexts) {
        const screen = searchPlatformMap(text, role, 1)[0];
        const route = screen ? getSafeCoCoNavigation(screen.route) : undefined;
        if (route) return route;
    }
    return undefined;
}

/** Texto plano de los últimos turnos de CoCo (bloques de texto y resultados de herramientas). */
export function recentAssistantTexts(conversation: Array<{ role: string; content: unknown }>, turns = 2): string[] {
    const texts: string[] = [];
    for (let index = conversation.length - 1; index >= 0 && texts.length < turns; index -= 1) {
        const turn = conversation[index];
        if (turn.role !== 'assistant') continue;
        if (typeof turn.content === 'string') {
            texts.push(turn.content);
            continue;
        }
        if (Array.isArray(turn.content)) {
            const parts = turn.content
                .map(block => (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') ? block.text : '')
                .filter(Boolean);
            if (parts.length) texts.push(parts.join(' '));
        }
    }
    return texts;
}
