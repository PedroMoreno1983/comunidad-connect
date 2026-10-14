import { describe, expect, it } from 'vitest';
import { compareQuotes, jobCategory, pickQuoteProviders, quoteSelectionError, type QuoteProvider, type QuoteRow } from '@/lib/maintenance/quotes';

const provider = (over: Partial<QuoteProvider>): QuoteProvider => ({
    id: 'p', name: 'Proveedor', category: 'plumbing', specialties: [], verified: true, rating: 4, completed_jobs: 10, ...over,
});
const quote = (over: Partial<QuoteRow>): QuoteRow => ({ id: 'q', provider_id: 'p', status: 'received', amount: 100000, ...over });

describe('maintenance quotes', () => {
    it('infers the job from the asset category or the ticket text', () => {
        expect(jobCategory({ assetCategory: 'Bomba de agua' })).toBe('pump');
        expect(jobCategory({ description: 'Falla del portón automático del acceso' })).toBe('gate');
        expect(jobCategory({ description: 'Pintar la sala multiuso' })).toBe('other');
    });

    it('picks up to 3 verified providers by affinity, then rating', () => {
        const providers = [
            provider({ id: 'a', name: 'Gasfiter A', rating: 4.2 }),
            provider({ id: 'b', name: 'Gasfiter B', rating: 4.9 }),
            provider({ id: 'c', name: 'Gasfiter C', verified: false, rating: 5 }),
            provider({ id: 'd', name: 'Electricista', category: 'electrical', rating: 5 }),
            provider({ id: 'e', name: 'Gasfiter E', rating: 3.1 }),
            provider({ id: 'f', name: 'Gasfiter F', rating: 4.5 }),
        ];
        expect(pickQuoteProviders({ category: 'pump', providers }).map(row => row.id)).toEqual(['b', 'f', 'a']);
        expect(pickQuoteProviders({ category: 'pump', providers, exclude: ['b'], max: 1 }).map(row => row.id)).toEqual(['f']);
    });

    it('compares received quotes: cheapest, highest and spread', () => {
        const comparison = compareQuotes([
            quote({ id: '1', amount: 120000 }), quote({ id: '2', amount: 100000 }), quote({ id: '3', status: 'requested', amount: null }),
        ]);
        expect(comparison).toMatchObject({ requested: 3, received: 2, pending: 1, spreadPct: 20 });
        expect(comparison.cheapest?.id).toBe('2');
    });

    it('needs two received quotes, or a written justification', () => {
        const one = [quote({ id: '1' }), quote({ id: '2', status: 'requested', amount: null })];
        expect(quoteSelectionError(one, '1')).toContain('al menos 2');
        expect(quoteSelectionError(one, '1', 'Emergencia: el ascensor está detenido')).toBeNull();
    });

    it('choosing a quote that is not the cheapest needs a justification', () => {
        const quotes = [quote({ id: '1', amount: 150000 }), quote({ id: '2', amount: 100000 })];
        expect(quoteSelectionError(quotes, '2')).toBeNull();
        expect(quoteSelectionError(quotes, '1')).toContain('más baja');
        expect(quoteSelectionError(quotes, '1', 'Garantía de 2 años y plazo de 3 días')).toBeNull();
    });

    it('rejects pending quotes, foreign ids and a second selection', () => {
        const quotes = [quote({ id: '1' }), quote({ id: '2', status: 'requested', amount: null })];
        expect(quoteSelectionError(quotes, '2', 'justificación larga')).toContain('recibida');
        expect(quoteSelectionError(quotes, 'x')).toContain('no pertenece');
        expect(quoteSelectionError([...quotes, quote({ id: '3', status: 'selected' })], '1', 'justificación larga')).toContain('ya tiene');
    });
});
