import { supabase } from '../supabase';

// ==========================================
// Amenities & Bookings Service
// ==========================================
export const AmenityService = {
    async getAll() {
        const { data, error } = await supabase
            .from('amenities')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (error) throw error;
        return data;
    },

    async getBookings(amenityId?: string, date?: string) {
        let query = supabase
            .from('bookings')
            .select(`
        *,
        amenities:amenity_id (name, icon_name),
        profiles:user_id (name)
      `)
            .order('date', { ascending: true });

        if (amenityId) query = query.eq('amenity_id', amenityId);
        if (date) query = query.eq('date', date);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async createBooking(booking: {
        amenity_id: string;
        user_id: string;
        date: string;
        start_time: string;
        end_time: string;
        notes?: string;
    }) {
        const { data, error } = await supabase
            .from('bookings')
            .insert(booking)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async cancelBooking(bookingId: string) {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', bookingId);

        if (error) throw error;
    },

    async confirmBooking(bookingId: string) {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'confirmed' })
            .eq('id', bookingId);

        if (error) throw error;
    },
};

// ==========================================
// Announcements / Feed Service
// ==========================================
export const AnnouncementService = {
    async getAll() {
        const { data, error } = await supabase
            .from('announcements')
            .select(`
        *,
        profiles:author_id (name, avatar_url)
      `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async create(announcement: {
        title: string;
        content: string;
        author_id: string;
        author_name: string;
        priority: 'info' | 'alert' | 'event';
        is_pinned?: boolean;
    }) {
        const { data, error } = await supabase
            .from('announcements')
            .insert(announcement)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async delete(id: string) {
        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },
};

// ==========================================
// Polls / Voting Service
// ==========================================
export const PollService = {
    async getAll() {
        const { data, error } = await supabase
            .from('polls')
            .select(`
        *,
        poll_options (*)
      `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async getById(pollId: string) {
        const { data, error } = await supabase
            .from('polls')
            .select(`
        *,
        poll_options (*)
      `)
            .eq('id', pollId)
            .single();

        if (error) throw error;
        return data;
    },

    async create(poll: {
        title: string;
        description?: string;
        category: string;
        end_date: string;
        created_by: string;
    }, options: string[]) {
        // Create poll
        const { data: pollData, error: pollError } = await supabase
            .from('polls')
            .insert(poll)
            .select()
            .single();

        if (pollError) throw pollError;

        // Create options
        const optionInserts = options.map((text: string, idx: number) => ({
            poll_id: pollData.id,
            text,
            display_order: idx,
        }));

        const { error: optionsError } = await supabase
            .from('poll_options')
            .insert(optionInserts);

        if (optionsError) throw optionsError;

        return pollData;
    },

    async vote(pollId: string, optionId: string, userId: string) {
        // Insert vote
        const { error: voteError } = await supabase
            .from('poll_votes')
            .insert({
                poll_id: pollId,
                option_id: optionId,
                user_id: userId,
            });

        if (voteError) throw voteError;

        // Increment option vote count
        const { error: updateError } = await supabase.rpc('increment_vote', {
            option_id: optionId,
        });

        // Fallback: manual increment if RPC doesn't exist
        if (updateError) {
            const { data: option } = await supabase
                .from('poll_options')
                .select('votes')
                .eq('id', optionId)
                .single();

            if (option) {
                await supabase
                    .from('poll_options')
                    .update({ votes: (option.votes || 0) + 1 })
                    .eq('id', optionId);
            }
        }
    },

    async getUserVote(pollId: string, userId: string) {
        const { data, error } = await supabase
            .from('poll_votes')
            .select('option_id')
            .eq('poll_id', pollId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) throw error;
        return data?.option_id || null;
    },

    async closePoll(pollId: string) {
        const { error } = await supabase
            .from('polls')
            .update({ status: 'closed' })
            .eq('id', pollId);

        if (error) throw error;
    },
};

// ==========================================
// Expenses Service
// ==========================================
export const ExpenseService = {
    async getByUnit(unitId: string) {
        const { data, error } = await supabase
            .from('expenses')
            .select(`
        *,
        expense_items (*)
      `)
            .eq('unit_id', unitId)
            .order('year', { ascending: false })
            .order('month', { ascending: false });

        if (error) throw error;
        return data;
    },

    async getAll() {
        const { data, error } = await supabase
            .from('expenses')
            .select(`
        *,
        expense_items (*),
        units:unit_id (number, tower, profiles:owner_id (name))
      `)
            .order('year', { ascending: false })
            .order('month', { ascending: false });

        if (error) throw error;
        return data;
    },

    async markAsPaid(expenseId: string) {
        const { error } = await supabase
            .from('expenses')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
            })
            .eq('id', expenseId);

        if (error) throw error;
    },

    async getStats() {
        const { data, error } = await supabase
            .from('expenses')
            .select('status, total_amount');

        if (error) throw error;

        const stats = {
            totalRevenue: 0,
            totalPending: 0,
            totalOverdue: 0,
            collectionRate: 0,
            total: data?.length || 0,
        };

        data?.forEach((e: any) => {
            if (e.status === 'paid') stats.totalRevenue += Number(e.total_amount);
            if (e.status === 'pending') stats.totalPending += Number(e.total_amount);
            if (e.status === 'overdue') stats.totalOverdue += Number(e.total_amount);
        });

        const totalAmount = stats.totalRevenue + stats.totalPending + stats.totalOverdue;
        stats.collectionRate = totalAmount > 0 ? (stats.totalRevenue / totalAmount) * 100 : 0;

        return stats;
    },
};

// ==========================================
// Condo Fees Service (Gastos Comunes - usa tabla 'expenses')
// ==========================================
export const CondoFeeService = {
    async getAll() {
        const { data, error } = await supabase
            .from('expenses')
            .select(`
                *,
                units:unit_id (number, tower)
            `)
            .order('year', { ascending: false })
            .order('month', { ascending: false });

        if (error) throw error;
        // Normalize: alias total_amount as amount for backward-compat with components
        return (data || []).map((e: any) => ({ ...e, amount: e.total_amount }));
    },

    async markAsPaid(expenseId: string, paymentMethod: string = 'manual') {
        const { error } = await supabase
            .from('expenses')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
            })
            .eq('id', expenseId);

        if (error) throw error;
    }
};

// ==========================================
// QR Invitations Service
// ==========================================
export const InvitationService = {
    async getByResident(residentId: string) {
        const { data, error } = await supabase
            .from('qr_invitations')
            .select('*')
            .eq('resident_id', residentId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async create(invitation: {
        resident_id: string;
        unit_id?: string;
        guest_name: string;
        guest_dni?: string;
        qr_code: string;
        valid_from: string;
        valid_to: string;
    }) {
        const { data, error } = await supabase
            .from('qr_invitations')
            .insert(invitation)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async cancel(invitationId: string) {
        const { error } = await supabase
            .from('qr_invitations')
            .update({ status: 'cancelled' })
            .eq('id', invitationId);

        if (error) throw error;
    },
};

// ==========================================
// Visitor & Package Services (Concierge)
// ==========================================
export const VisitorService = {
    async getAll() {
        const { data, error } = await supabase
            .from('visitor_logs')
            .select(`
        *,
        units:unit_id (number, tower)
      `)
            .order('entry_time', { ascending: false });

        if (error) throw error;
        return data;
    },

    async register(visitor: {
        visitor_name: string;
        unit_id?: string;
        purpose?: string;
        registered_by: string;
    }) {
        const { data, error } = await supabase
            .from('visitor_logs')
            .insert(visitor)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async registerExit(visitorId: string) {
        const { error } = await supabase
            .from('visitor_logs')
            .update({ exit_time: new Date().toISOString() })
            .eq('id', visitorId);

        if (error) throw error;
    },
};

export const PackageService = {
    async getAll() {
        const { data, error } = await supabase
            .from('packages')
            .select('*')
            .order('received_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async register(pkg: {
        recipient_unit_id: string;
        description: string;
        registered_by: string;
    }) {
        const { data, error } = await supabase
            .from('packages')
            .insert(pkg)
            .select()
            .single();

        if (error) throw error;

        // Internal Notification / Alert for the resident
        await supabase
            .from('announcements')
            .insert({
                title: '📦 ¡Tienes un paquete nuevo!',
                content: `El conserje ha recibido una encomienda para ti. Descripción: ${pkg.description}`,
                author_id: pkg.registered_by,
                unit_id: pkg.recipient_unit_id,
                type: 'info'
            });

        return data;
    },

    async markPickedUp(packageId: string) {
        const { error } = await supabase
            .from('packages')
            .update({
                status: 'picked-up',
                picked_up_at: new Date().toISOString(),
            })
            .eq('id', packageId);

        if (error) throw error;
    },
};

// ==========================================
// Service Requests
// ==========================================
export const ServiceRequestService = {
    async getByUser(userId: string) {
        const { data, error } = await supabase
            .from('service_requests')
            .select('*')
            .eq('requester_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async getAll() {
        const { data, error } = await supabase
            .from('service_requests')
            .select(`
        *,
        profiles:requester_id (name),
        units:unit_id (number, tower)
      `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async create(request: {
        requester_id: string;
        unit_id?: string;
        service_type: string;
        description: string;
        scheduled_date?: string;
        scheduled_time?: string;
    }) {
        const { data, error } = await supabase
            .from('service_requests')
            .insert(request)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateStatus(requestId: string, status: string) {
        const { error } = await supabase
            .from('service_requests')
            .update({ status })
            .eq('id', requestId);

        if (error) throw error;
    },
};

// ==========================================
// Reservations & Amenities
// ==========================================
export const ReservationService = {
    async getAmenities() {
        const { data, error } = await supabase
            .from('amenities')
            .select('*')
            .order('name');

        if (error) throw error;
        return data;
    },

    async getBookingsByUser(userId: string) {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
                *,
                amenities:amenity_id (name, icon_name, gradient)
            `)
            .eq('user_id', userId)
            .order('date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) throw error;
        return data;
    },

    async createBooking(booking: {
        amenity_id: string;
        user_id: string;
        date: string;
        start_time: string;
        end_time: string;
    }) {
        const { data, error } = await supabase
            .from('bookings')
            .insert({ ...booking, status: 'pending' })
            .select()
            .single();

        if (error) throw error;
        return data;
    }
};

// ==========================================
// Social Network (Phase 4)
// ==========================================
export const SocialService = {
    async getPosts() {
        const { data, error } = await supabase
            .from('social_posts')
            .select(`
                *,
                profiles:author_id (name, avatar_url, unit_id),
                comments:social_comments(count)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Transform the nested comments count
        return data?.map((post: any) => ({
            ...post,
            comments_count: post.comments[0]?.count || 0
        }));
    },

    async createPost(post: { author_id: string; content: string; image_url?: string }) {
        const { data, error } = await supabase
            .from('social_posts')
            .insert(post)
            .select(`
                *,
                profiles:author_id (name, avatar_url, unit_id)
            `)
            .single();

        if (error) throw error;
        return { ...data, comments_count: 0 };
    },

    async likePost(postId: string) {
        // Increment likes count via rpc or simple update if RLS allows
        const { error } = await supabase.rpc('increment_post_likes', { post_id: postId });
        if (error) throw error;
    },

    async getComments(postId: string) {
        const { data, error } = await supabase
            .from('social_comments')
            .select(`
                *,
                profiles:author_id (name, avatar_url)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data;
    },

    async createComment(comment: { post_id: string; author_id: string; content: string }) {
        const { data, error } = await supabase
            .from('social_comments')
            .insert(comment)
            .select(`
                *,
                profiles:author_id (name, avatar_url)
            `)
            .single();

        if (error) throw error;
        return data;
    }
};

// ==========================================
// Real-time Chat (Phase 4)
// ==========================================
export const ChatService = {
    async getGlobalMessages(limit = 50) {
        const { data, error } = await supabase
            .from('chat_messages')
            .select(`
                *,
                profiles:sender_id (name, avatar_url)
            `)
            .is('receiver_id', null)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data.reverse(); // Return chronological
    },

    async sendMessage(message: { sender_id: string; receiver_id?: string; content: string }) {
        const { data, error } = await supabase
            .from('chat_messages')
            .insert(message)
            .select(`
                *,
                profiles:sender_id (name, avatar_url)
            `)
            .single();

        if (error) throw error;
        return data;
    },

    // Subscribe to new messages. Returns the channel to be able to unsubscribe.
    subscribeToGlobalChat(onNewMessage: (msg: any) => void) {
        const channel = supabase.channel('global_chat')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: 'receiver_id=is.null' // Only listen to global chat
                },
                async (payload: any) => {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('name, avatar_url')
                        .eq('id', payload.new.sender_id)
                        .single();

                    const enrichedMessage = { ...payload.new, profiles: profile };
                    onNewMessage(enrichedMessage);
                }
            )
            .subscribe();

        return channel;
    },

    // ---- Direct Messages ----

    // Get all DMs between two specific users
    async getDirectMessages(userId: string, peerId: string, limit = 50) {
        const { data, error } = await supabase
            .from('chat_messages')
            .select(`
                *,
                profiles:sender_id (name, avatar_url)
            `)
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${userId})`)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []).reverse();
    },

    // Subscribe to DMs in a specific conversation
    subscribeToDirectChat(myId: string, peerId: string, onNewMessage: (msg: any) => void) {
        const channelName = [myId, peerId].sort().join('_');
        const channel = supabase.channel(`dm_${channelName}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                },
                async (payload: any) => {
                    const msg = payload.new as any;
                    // Only act on messages relevant to this conversation
                    const isRelevant = (
                        (msg.sender_id === myId && msg.receiver_id === peerId) ||
                        (msg.sender_id === peerId && msg.receiver_id === myId)
                    );
                    if (!isRelevant) return;

                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('name, avatar_url')
                        .eq('id', msg.sender_id)
                        .single();

                    onNewMessage({ ...msg, profiles: profile });
                }
            )
            .subscribe();

        return channel;
    },

    // Get list of users the current user has had DMs with
    async getConversations(userId: string) {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('sender_id, receiver_id, content, created_at')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .filter('receiver_id', 'is', null) // Change filter approach or use .not('receiver_id', 'is', null) correctly
            // Actually, let's use the explicit NOT IS NULL syntax
            .not('receiver_id', 'is', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Collect unique peer IDs
        const seen = new Set<string>();
        const peerIds: string[] = [];
        for (const msg of (data || [])) {
            const peerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
            if (!seen.has(peerId)) {
                seen.add(peerId);
                peerIds.push(peerId);
            }
        }

        // Fetch profiles for those peers
        const profileMap: Record<string, any> = {};
        if (peerIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, avatar_url')
                .in('id', peerIds);
            (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });
        }

        // Build conversations list
        const conversations: any[] = [];
        const added = new Set<string>();
        for (const msg of (data || [])) {
            const peerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
            if (!added.has(peerId)) {
                added.add(peerId);
                conversations.push({
                    peerId,
                    peerProfile: profileMap[peerId] || { name: 'Vecino', avatar_url: null },
                    lastMessage: msg.content,
                    lastAt: msg.created_at
                });
            }
        }
        return conversations;
    }
};
