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
        profiles:user_id (full_name, email)
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
        profiles:author_id (full_name, avatar_url)
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
        const optionInserts = options.map((text, idx) => ({
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
        units:unit_id (number, tower, profiles:resident_profile_id (full_name))
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

        data?.forEach(e => {
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
            .select(`
        *,
        units:recipient_unit_id (number, tower, profiles:resident_profile_id (full_name))
      `)
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
        profiles:requester_id (full_name, email),
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
