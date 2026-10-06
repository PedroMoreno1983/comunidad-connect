import { describe, expect, it } from 'vitest';
import { serviceRequestTransitionError, validServiceSchedule } from '@/lib/services/requestLifecycle';
import type { ServiceRequestStatus } from '@/lib/types';

describe('service request role and transition boundaries', () => {
    function transition(current: ServiceRequestStatus, next: ServiceRequestStatus, requester = false, manager = true, reschedule = false) {
        return serviceRequestTransitionError({ current, next, requester, manager, reschedule });
    }
    it('requires acceptance, delivery and resident confirmation in order', () => {
        expect(transition('pending', 'awaiting_confirmation')).toBeTruthy();
        expect(transition('pending', 'completed')).toBeTruthy();
        expect(transition('pending', 'accepted')).toBeNull();
        expect(transition('accepted', 'awaiting_confirmation')).toBeNull();
        expect(transition('awaiting_confirmation', 'completed')).toBeTruthy();
        expect(transition('awaiting_confirmation', 'completed', true, false)).toBeNull();
    });
    it('prevents requester acceptance, strangers, and reopening terminal requests', () => {
        expect(transition('pending', 'accepted', true, false)).toBeTruthy();
        expect(transition('pending', 'cancelled', false, false)).toBeTruthy();
        expect(transition('completed', 'pending', true)).toBeTruthy();
        expect(transition('cancelled', 'accepted')).toBeTruthy();
    });
    it('allows rescheduling only before delivery, resetting acceptance', () => {
        expect(transition('accepted', 'pending', true, false, true)).toBeNull();
        expect(transition('accepted', 'accepted', true, false, true)).toBeTruthy();
        expect(transition('awaiting_confirmation', 'pending', true, false, true)).toBeTruthy();
    });
    it('rejects impossible dates and invalid appointment times', () => {
        expect(validServiceSchedule('2026-02-30', '10:00')).toBe(false);
        expect(validServiceSchedule('2026-10-08', '25:00')).toBe(false);
        expect(validServiceSchedule('2026-10-08', '10:00')).toBe(true);
    });
});
