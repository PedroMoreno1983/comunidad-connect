import { ChatMessage, Conversation, User } from "@/lib/types";

export type DemoChatNeighbor = { id: string; name: string; avatar_url?: string };

const demoGlobalChatStorageKey = "cc_demo_global_chat_messages";
const demoDirectChatStorageKey = "cc_demo_direct_chat_messages";

export const demoChatNeighbors: DemoChatNeighbor[] = [
    { id: "demo-resident-marta", name: "Marta Rojas" },
    { id: "demo-resident-diego", name: "Diego Salinas" },
    { id: "demo-concierge-turno", name: "Conserje Turno" },
];

function minutesAgo(minutes: number) {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function sortMessages(messages: ChatMessage[]) {
    return [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function readJson<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        return JSON.parse(window.localStorage.getItem(key) || "") as T;
    } catch {
        return fallback;
    }
}

function writeJson<T>(key: string, value: T) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
}

function getPeerName(peerId: string) {
    return demoChatNeighbors.find(neighbor => neighbor.id === peerId)?.name || "Vecino";
}

function getPeerAvatar(peerId: string) {
    return demoChatNeighbors.find(neighbor => neighbor.id === peerId)?.avatar_url;
}

function getDemoBaseGlobalMessages(userName?: string): ChatMessage[] {
    return [
        {
            id: "demo-global-1",
            sender_id: "demo-resident-marta",
            content: "Hola comunidad, recuerden que hoy hay mantencion preventiva del ascensor B desde las 16:00.",
            created_at: minutesAgo(52),
            profiles: { name: "Marta Rojas" },
        },
        {
            id: "demo-global-2",
            sender_id: "demo-concierge-turno",
            content: "Confirmado. Dejamos el aviso visible en hall y ascensores.",
            created_at: minutesAgo(48),
            profiles: { name: "Conserje Turno" },
        },
        {
            id: "demo-global-3",
            sender_id: "demo-admin",
            content: `Gracias ${userName || "Admin"}. Cualquier novedad quedara registrada en comunicaciones.`,
            created_at: minutesAgo(34),
            profiles: { name: "Admin Showcase" },
        },
    ];
}

function getDemoBaseConversations(): Conversation[] {
    return [
        {
            peerId: "demo-resident-marta",
            peerProfile: { name: "Marta Rojas" },
            lastMessage: "Te envie el comprobante de reserva del quincho.",
            lastAt: minutesAgo(18),
        },
        {
            peerId: "demo-concierge-turno",
            peerProfile: { name: "Conserje Turno" },
            lastMessage: "El proveedor ya ingreso por recepcion.",
            lastAt: minutesAgo(7),
        },
    ];
}

function getDemoBaseDirectMessages(userId: string, userName: string | undefined, peerId: string): ChatMessage[] {
    const peerName = getPeerName(peerId);

    return [
        {
            id: `demo-direct-${peerId}-1`,
            sender_id: peerId,
            receiver_id: userId,
            content: peerId === "demo-concierge-turno"
                ? "Hola, dejo registrado que el proveedor de electricidad ya llego y esta esperando autorizacion."
                : "Hola, puedes ayudarme a revisar el estado de mi solicitud cuando tengas un minuto?",
            created_at: minutesAgo(16),
            profiles: { name: peerName, avatar_url: getPeerAvatar(peerId) },
        },
        {
            id: `demo-direct-${peerId}-2`,
            sender_id: userId,
            receiver_id: peerId,
            content: "Si, lo reviso ahora y te confirmo por este mismo chat.",
            created_at: minutesAgo(11),
            profiles: { name: userName || "Admin Showcase" },
        },
    ];
}

function getStoredGlobalMessages(): ChatMessage[] {
    return readJson<ChatMessage[]>(demoGlobalChatStorageKey, []);
}

function getStoredDirectMessagesMap(): Record<string, ChatMessage[]> {
    return readJson<Record<string, ChatMessage[]>>(demoDirectChatStorageKey, {});
}

export function getDemoGlobalMessages(userName?: string): ChatMessage[] {
    return sortMessages([...getDemoBaseGlobalMessages(userName), ...getStoredGlobalMessages()]);
}

export function getDemoConversations(): Conversation[] {
    const directMessagesByPeer = getStoredDirectMessagesMap();
    const conversationsByPeer = new Map<string, Conversation>(
        getDemoBaseConversations().map(conversation => [conversation.peerId, conversation])
    );

    Object.entries(directMessagesByPeer).forEach(([peerId, messages]) => {
        const lastMessage = sortMessages(messages).at(-1);
        if (!lastMessage) return;

        conversationsByPeer.set(peerId, {
            peerId,
            peerProfile: { name: getPeerName(peerId), avatar_url: getPeerAvatar(peerId) },
            lastMessage: lastMessage.content,
            lastAt: lastMessage.created_at,
        });
    });

    return [...conversationsByPeer.values()].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

export function getDemoDirectMessages(user: User, peerId: string): ChatMessage[] {
    const storedByPeer = getStoredDirectMessagesMap();
    return sortMessages([
        ...getDemoBaseDirectMessages(user.id, user.name, peerId),
        ...(storedByPeer[peerId] || []),
    ]);
}

export function createDemoChatMessage(user: User, content: string, receiverId?: string): ChatMessage {
    return {
        id: `demo-message-${Date.now()}`,
        sender_id: user.id,
        receiver_id: receiverId,
        content,
        created_at: new Date().toISOString(),
        profiles: { name: user.name || "Admin Showcase", avatar_url: user.photo || user.avatarUrl },
    };
}

export function saveDemoChatMessage(message: ChatMessage) {
    if (message.receiver_id) {
        const storedByPeer = getStoredDirectMessagesMap();
        const nextMessages = sortMessages([...(storedByPeer[message.receiver_id] || []), message]);
        storedByPeer[message.receiver_id] = nextMessages;
        writeJson(demoDirectChatStorageKey, storedByPeer);
        return;
    }

    writeJson(demoGlobalChatStorageKey, sortMessages([...getStoredGlobalMessages(), message]));
}
