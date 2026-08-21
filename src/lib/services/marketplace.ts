/**
 * Marketplace vecinal: publicaciones, compraventa y mensajeria entre vecinos.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    MarketplaceConversation,
    MarketplaceItem,
    MarketplaceMessage,
} from '../types';

// ==========================================
// Marketplace API
// ==========================================

type MarketplaceRow = Record<string, unknown>;

function mapMarketplaceItem(row: MarketplaceRow): MarketplaceItem {
    const imageUrl = (row.image_url as string | null | undefined) ?? (row.imageUrl as string | undefined);
    const images = Array.isArray(row.images)
        ? (row.images as string[])
        : imageUrl
            ? [imageUrl]
            : [];

    return {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string,
        price: Number(row.price) || 0,
        category: row.category as MarketplaceItem['category'],
        sellerId: (row.seller_id as string | undefined) ?? (row.sellerId as string),
        imageUrl,
        images,
        status: ((row.status as MarketplaceItem['status'] | undefined) || 'available'),
        allowSale: (row.allow_sale as boolean | undefined) ?? (row.allowSale as boolean | undefined) ?? true,
        allowSwap: (row.allow_swap as boolean | undefined) ?? (row.allowSwap as boolean | undefined) ?? false,
        swapDetails: (row.swap_details as string | undefined) ?? (row.swapDetails as string | undefined) ?? '',
        allowBarter: (row.allow_barter as boolean | undefined) ?? (row.allowBarter as boolean | undefined) ?? false,
        barterDetails: (row.barter_details as string | undefined) ?? (row.barterDetails as string | undefined) ?? '',
        paymentStatus: (row.payment_status as MarketplaceItem['paymentStatus'] | undefined) ?? (row.paymentStatus as MarketplaceItem['paymentStatus'] | undefined) ?? 'none',
        createdAt: (row.created_at as string | undefined) ?? (row.createdAt as string) ?? new Date().toISOString(),
    };
}

function isMissingMarketplaceColumnError(error: { message?: string; code?: string } | null): boolean {
    if (!error) return false;
    const message = error.message?.toLowerCase() ?? '';
    return error.code === 'PGRST204' || error.code === '42703' || message.includes('allow_sale') || message.includes('images');
}


type MarketplaceInboxRow = {
    conversation_id: string;
    item_id: string;
    item_title: string;
    item_image_url?: string | null;
    item_status: MarketplaceItem['status'];
    buyer_id: string;
    seller_id: string;
    peer_id: string;
    peer_name: string;
    peer_avatar_url?: string | null;
    last_message?: string | null;
    last_message_at: string;
    unread_count?: number | string | null;
};

type MarketplaceMessageRow = {
    id: string;
    conversation_id: string;
    community_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    read_at?: string | null;
};

function mapMarketplaceConversation(row: MarketplaceInboxRow): MarketplaceConversation {
    return {
        id: row.conversation_id,
        itemId: row.item_id,
        itemTitle: row.item_title,
        itemImageUrl: row.item_image_url || undefined,
        itemStatus: row.item_status,
        buyerId: row.buyer_id,
        sellerId: row.seller_id,
        peerId: row.peer_id,
        peerName: row.peer_name || 'Residente',
        peerAvatarUrl: row.peer_avatar_url || undefined,
        lastMessage: row.last_message || undefined,
        lastMessageAt: row.last_message_at,
        unreadCount: Number(row.unread_count || 0),
    };
}

function mapMarketplaceMessage(row: MarketplaceMessageRow): MarketplaceMessage {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        communityId: row.community_id,
        senderId: row.sender_id,
        content: row.content,
        createdAt: row.created_at,
        readAt: row.read_at || undefined,
    };
}

export const MarketplaceService = {
    // Obtener todos los productos activos
    async getItemsV2(): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .neq('status', 'hidden')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase error in getItemsV2:", error.message);
            throw error;
        }
        return (data || []).map(mapMarketplaceItem);
    },

    async getMyItems(userId: string): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .eq('seller_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapMarketplaceItem);
    },

    async getModerationItems(): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapMarketplaceItem);
    },

    // Publicar un nuevo producto con fotos
    async createItem(item: Partial<MarketplaceItem>, imageFiles: File[]): Promise<MarketplaceItem> {
        const imageUrls: string[] = [];
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) throw new Error("Debes estar autenticado para publicar");

        const { data: profile } = await supabase
            .from('profiles')
            .select('community_id')
            .eq('id', user.id)
            .single();

        // 1. Subir imágenes si existen
        for (const file of imageFiles) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`; // Organizado por carpeta de usuario

            const { error: uploadError } = await supabase.storage
                .from('marketplace')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('marketplace')
                .getPublicUrl(filePath);

            imageUrls.push(publicUrl);
        }

        const payload = {
            title: item.title,
            description: item.description,
            price: Number(item.price) || 0,
            category: item.category,
            image_url: imageUrls.length > 0 ? imageUrls[0] : null,
            images: imageUrls,
            allow_sale: item.allowSale !== false,
            allow_swap: Boolean(item.allowSwap),
            swap_details: item.swapDetails || '',
            allow_barter: Boolean(item.allowBarter),
            barter_details: item.barterDetails || '',
            payment_status: 'none',
            community_id: (profile as { community_id?: string | null } | null)?.community_id,
            seller_id: user.id
        };

        // 2. Insertar item en la DB
        let result = await supabase
            .from('marketplace_items')
            .insert(payload)
            .select()
            .single();

        if (isMissingMarketplaceColumnError(result.error)) {
            result = await supabase
                .from('marketplace_items')
                .insert({
                    title: payload.title,
                    description: payload.description,
                    price: payload.price,
                    category: payload.category,
                    image_url: payload.image_url,
                    seller_id: payload.seller_id
                })
                .select()
                .single();
        }

        const { data, error } = result;

        if (error) {
            console.error("Supabase error in createItem:", error.message, error.details);
            throw error;
        }
        return mapMarketplaceItem(data);
    },

    // Marcar como vendido o inactivar
    async updateStatus(itemId: string, status: 'available' | 'reserved' | 'sold') {
        const { error } = await supabase
            .from('marketplace_items')
            .update({ status })
            .eq('id', itemId);

        if (error) throw error;
    },

    async diagnosticStorage() {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) return { error: error.message };
        return { buckets: data.map((b: { name: string }) => b.name) };
    }
};

export const MarketplaceMessagingService = {
    async startConversation(itemId: string): Promise<string> {
        const { data, error } = await supabase.rpc('start_marketplace_conversation', {
            p_item_id: itemId,
        });

        if (error) throw error;
        if (typeof data !== 'string') throw new Error('No se pudo abrir la conversación.');
        return data;
    },

    async listConversations(): Promise<MarketplaceConversation[]> {
        const { data, error } = await supabase.rpc('get_marketplace_inbox');
        if (error) throw error;
        return ((data || []) as MarketplaceInboxRow[]).map(mapMarketplaceConversation);
    },

    async getMessages(conversationId: string): Promise<MarketplaceMessage[]> {
        const { data, error } = await supabase
            .from('marketplace_conversation_messages')
            .select('id,conversation_id,community_id,sender_id,content,created_at,read_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return ((data || []) as MarketplaceMessageRow[]).map(mapMarketplaceMessage);
    },

    async sendMessage(conversationId: string, content: string): Promise<MarketplaceMessage> {
        const cleanContent = content.trim();
        if (!cleanContent) throw new Error('Escribe un mensaje antes de enviarlo.');
        if (cleanContent.length > 2000) throw new Error('El mensaje supera el máximo de 2.000 caracteres.');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw authError || new Error('Debes iniciar sesión para escribir.');

        const { data, error } = await supabase
            .from('marketplace_conversation_messages')
            .insert({
                conversation_id: conversationId,
                sender_id: authData.user.id,
                content: cleanContent,
            })
            .select('id,conversation_id,community_id,sender_id,content,created_at,read_at')
            .single();

        if (error) throw error;
        return mapMarketplaceMessage(data as MarketplaceMessageRow);
    },

    async markRead(conversationId: string): Promise<void> {
        const { error } = await supabase.rpc('mark_marketplace_conversation_read', {
            p_conversation_id: conversationId,
        });
        if (error) throw error;
    },

    subscribeToConversation(
        conversationId: string,
        onMessage: (message: MarketplaceMessage) => void,
    ): () => void {
        const channel = supabase
            .channel(`marketplace-conversation-${conversationId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'marketplace_conversation_messages',
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload: { new: unknown }) => onMessage(mapMarketplaceMessage(payload.new as MarketplaceMessageRow)),
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    },
};
