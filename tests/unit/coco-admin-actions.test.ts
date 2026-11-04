import { describe, expect, it } from 'vitest';
import { nextBookingStatus } from '@/lib/coco/bookingDecision';
import { MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { reminderAudienceAllowed } from '@/lib/coco/reminders';

describe('decisiones de administración', () => {
    it('aprueba solo una reserva pendiente y anular deshace también una confirmada', () => {
        expect(nextBookingStatus('pending', 'approve')).toBe('confirmed');
        expect(nextBookingStatus('confirmed', 'approve')).toBeNull();
        expect(nextBookingStatus('pending', 'reject')).toBe('cancelled');
        expect(nextBookingStatus('confirmed', 'reject')).toBe('cancelled');
        expect(nextBookingStatus('cancelled', 'reject')).toBeNull();
    });

    it('emisión, aviso y reservas son solo del administrador y piden confirmación', () => {
        for (const tool of ['cancel_issued_billing', 'schedule_community_notice', 'decide_booking']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
            expect(isToolAllowedForRole(tool, 'concierge')).toBe(false);
        }
        expect(MUTATING_TOOLS.has('list_pending_bookings')).toBe(false);
        expect(isToolAllowedForRole('list_pending_bookings', 'admin')).toBe(true);
        expect(reminderAudienceAllowed('admin', 'community_notice')).toBe(true);
        expect(reminderAudienceAllowed('resident', 'community_notice')).toBe(false);
    });
});
