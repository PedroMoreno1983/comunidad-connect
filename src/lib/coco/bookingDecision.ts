/** Transición de una reserva que decide la administración. Pura. */
export function nextBookingStatus(current: string, decision: 'approve' | 'reject'): 'confirmed' | 'cancelled' | null {
    if (decision === 'approve' && current === 'pending') return 'confirmed';
    if (decision === 'reject' && (current === 'pending' || current === 'confirmed')) return 'cancelled';
    return null;
}
