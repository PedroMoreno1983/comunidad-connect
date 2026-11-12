import type { ConversationMessage } from '@/lib/coco/session-store';
import { parseGroupShoppingList } from '@/lib/supermarketGroupDomain';

const SHOPPING_CONTEXT = /supermercado|lista de compras|carrito|compras|arroz/i;
const SAVE_REQUEST = /\b(?:guarda|guardar|gu[aá]rdame|salva|salvar)\b.*\b(?:lista|compras|supermercado)\b/i;
const LIST_REQUEST = /\b(?:lista de compras|lista para el supermercado|comprar en el supermercado)\b/i;

function listBody(value: string): string | null {
    const body = value.trim()
        .replace(/^(?:hola[,! ]*)?(?:hazme|haz|arma|armar|crea|crear|guarda|guardar|gu[aá]rdame|quiero|necesito|anota|anotar)\s+(?:(?:una?|esta|la|mi|mis)\s+)?(?:lista\s+de\s+compras|lista\s+para\s+el\s+supermercado|compras)(?:\s+(?:con|de))?\s*:?\s*/i, '')
        .trim();
    if (!/[,;\n]/.test(body)) return null;
    return parseGroupShoppingList(body, true).length >= 2 ? body : null;
}

/** Solo prepara una lista cuando el hilo indica una intención de compra clara. */
export function shoppingListFromConversation(message: string, conversation: ConversationMessage[]): string | null {
    const recent = conversation.slice(-8);
    const lastAssistant = [...recent].reverse().find(turn => turn.role === 'assistant' && typeof turn.content === 'string');
    const assistantText = lastAssistant && typeof lastAssistant.content === 'string' ? lastAssistant.content : '';
    const direct = listBody(message);
    if (direct && (SHOPPING_CONTEXT.test(assistantText) || LIST_REQUEST.test(message) || SAVE_REQUEST.test(message))) {
        return direct;
    }
    if (SAVE_REQUEST.test(message) || (/^(?:s[ií]|dale|ok|claro)[.! ]*$/i.test(message.trim()) && /(?:quieres|deseas).*guard/i.test(assistantText))) {
        const lastUserList = [...recent].reverse()
            .filter(turn => turn.role === 'user' && typeof turn.content === 'string')
            .map(turn => listBody(turn.content as string))
            .find((body): body is string => Boolean(body));
        return lastUserList || null;
    }
    return null;
}
