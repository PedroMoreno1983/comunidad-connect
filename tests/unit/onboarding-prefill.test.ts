import { describe, expect, it } from 'vitest';
import { onboardingPrefillFromQuery } from '@/lib/onboardingPrefill';

describe('borrador de alta por enlace', () => {
    it('prepara los 79 sitios del plano sin crear cuenta ni comunidad', () => {
        const draft = onboardingPrefillFromQuery('?prefill=1&communityName=Bah%C3%ADa+Las+Palmas&unitType=house&unitNumbers=1-79&fullName=Lauk%C3%A9n+Inmobiliaria&email=hola%40lauken.cl');
        expect(draft).toMatchObject({ communityName: 'Bahía Las Palmas', unitType: 'house', unitCount: 79, email: 'hola@lauken.cl' });
        expect(draft?.unitNumbers).toEqual(Array.from({ length: 79 }, (_, index) => String(index + 1)));
    });

    it('rechaza rangos inválidos y datos incompletos', () => {
        expect(onboardingPrefillFromQuery('?prefill=1&communityName=X&unitType=house&unitNumbers=79-1&fullName=Y&email=y%40x.cl')).toBeNull();
        expect(onboardingPrefillFromQuery('?prefill=1&communityName=X&unitType=house&unitNumbers=1-801&fullName=Y&email=y%40x.cl')).toBeNull();
        expect(onboardingPrefillFromQuery('?prefill=1&communityName=X&unitType=house&unitNumbers=1-79&fullName=Y')).toBeNull();
    });
});
