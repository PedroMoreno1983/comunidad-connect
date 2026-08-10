import { afterEach, describe, expect, it } from 'vitest';
import {
    analyticFocus,
    extractUnitNumber,
    isIndividualDebtQuery,
    isMonthlyBillingRequest,
    looksLikeAnalyticQuestion,
} from '../../src/lib/agent-center/intentSafety';
import { askedForUnitOrResident, enrichMessageWithHistory, type ConversationTurn } from '../../src/lib/agent-center/conversationContext';
import { plannerDegradationFromError, plannerUnavailableDegradation } from '../../src/lib/agent-center/planner';
import { AiBudgetExceededError, isUuid } from '../../src/lib/ai/budget';

// El caso reportado en producción: dos turnos seguidos que terminaron en una
// aclaración genérica porque el planner no corrió y la heurística no tenía ni
// vocabulario analítico ni memoria.
const REPORTED_QUESTION = 'quien debe gastos comunes?';
const REPORTED_FOLLOW_UP = 'depaetamento 1204';

describe('Agent Center: preguntas agregadas', () => {
    it('trata "quien debe gastos comunes" como consulta analitica, no como deuda individual', () => {
        expect(isIndividualDebtQuery(REPORTED_QUESTION)).toBe(false);
        expect(looksLikeAnalyticQuestion(REPORTED_QUESTION)).toBe(true);
        expect(analyticFocus(REPORTED_QUESTION)).toBe('finance');
    });

    it.each([
        'quien debe gastos comunes',
        'quienes estan morosos este mes',
        'como viene la morosidad',
        'cuantos tickets abiertos hay',
        'dame un resumen del estado del edificio',
        'cual es el total de deuda del edificio?',
    ])('reconoce la pregunta agregada: %s', message => {
        expect(looksLikeAnalyticQuestion(message)).toBe(true);
    });

    it.each([
        ['quienes estan morosos este mes', 'finance'],
        ['cual es el total de gastos comunes impagos', 'finance'],
        ['cuantos tickets abiertos hay', 'maintenance'],
        ['cuantas reservas hay para el quincho', 'community'],
        ['dame un resumen del estado del edificio', 'all'],
    ])('enruta el foco por plural y derivados: %s -> %s', (message, focus) => {
        // Regresion: los terminos se cerraban con \b y "moros" no matcheaba
        // "morosos", asi que casi toda pregunta terminaba con foco 'all'.
        expect(analyticFocus(message)).toBe(focus);
    });

    it('no confunde la emision mensual con una pregunta', () => {
        // Comparte el vocabulario "gasto comun" pero es una instruccion.
        expect(isMonthlyBillingRequest('puedes armar el gasto comun de julio?')).toBe(true);
        expect(looksLikeAnalyticQuestion('puedes armar el gasto comun de julio?')).toBe(false);
        expect(looksLikeAnalyticQuestion('arma el gasto comun de julio')).toBe(false);
    });

    it.each([
        'crea un cobro de 50000 para el depto 504',
        'envia un recordatorio de pago al depto 1204',
        'registra la visita de Ana Rojas',
    ])('no desvia una escritura hacia el snapshot: %s', message => {
        expect(looksLikeAnalyticQuestion(message)).toBe(false);
    });

    it('deja la deuda de una unidad puntual en la consulta individual', () => {
        // Lo especifico gana: el llamador resuelve isIndividualDebtQuery primero.
        expect(isIndividualDebtQuery('cuanto debe el departamento 1204?')).toBe(true);
    });

    it('la mencion de "quien" a mitad de frase no vuelve lectura una instruccion', () => {
        expect(looksLikeAnalyticQuestion('a quien le envio el comunicado de la reunion')).toBe(false);
    });
});

describe('Agent Center: memoria del fallback deterministico', () => {
    const historyAskingForUnit: ConversationTurn[] = [
        { role: 'user', content: REPORTED_QUESTION },
        { role: 'assistant', content: 'Indica el nombre del residente o el departamento cuya deuda deseas consultar.' },
    ];

    it('detecta que el turno anterior pidio un departamento', () => {
        expect(askedForUnitOrResident(historyAskingForUnit)).toBe(true);
        expect(askedForUnitOrResident([{ role: 'assistant', content: 'Listo, la reserva quedo confirmada.' }])).toBe(false);
    });

    it('resuelve el seguimiento con typo contra la pregunta anterior', () => {
        const enriched = enrichMessageWithHistory(REPORTED_FOLLOW_UP, historyAskingForUnit);

        // El typo "depaetamento" no lo reconoce ningun regex por si solo.
        expect(extractUnitNumber(REPORTED_FOLLOW_UP)).toBe('');
        expect(extractUnitNumber(enriched)).toBe('1204');
        expect(isIndividualDebtQuery(enriched)).toBe(true);
    });

    it('resuelve un seguimiento que es solo el numero', () => {
        const enriched = enrichMessageWithHistory('1204', historyAskingForUnit);
        expect(extractUnitNumber(enriched)).toBe('1204');
        expect(isIndividualDebtQuery(enriched)).toBe(true);
    });

    it('no inventa un departamento cuando el agente no pidio uno', () => {
        const history: ConversationTurn[] = [
            { role: 'user', content: 'cuanto sale la mantencion del ascensor' },
            { role: 'assistant', content: 'Preparé la revisión de tickets de mantención.' },
        ];
        // 75000 es un monto, no una unidad: sin la pregunta previa por
        // departamento, el numero no se reescribe.
        expect(enrichMessageWithHistory('75000', history)).toBe('cuanto sale la mantencion del ascensor 75000');
        expect(extractUnitNumber(enrichMessageWithHistory('75000', history))).toBe('');
    });

    it('devuelve el mensaje intacto sin historial', () => {
        expect(enrichMessageWithHistory(REPORTED_FOLLOW_UP, [])).toBe(REPORTED_FOLLOW_UP);
    });
});

describe('Presupuesto de IA: forma de UUID', () => {
    it.each([
        '00000000-0000-0000-0000-000000000000',
        '11111111-1111-1111-1111-111111111111',
        'b392cf17-fd6b-47dd-b0b4-72b0e007824e',
    ])('acepta los ids que esta base usa de verdad: %s', value => {
        // Regresion: el regex exigia los nibbles RFC 4122 de version [1-5] y
        // variante [89ab], asi que rechazaba la comunidad por defecto y el
        // condominio demo. Con eso, fetchBudget ignoraba su fila de ai_budgets
        // y esas comunidades quedaban sin tope de gasto de IA.
        expect(isUuid(value)).toBe(true);
    });

    it.each([null, undefined, '', 'no-es-uuid', '11111111-1111-1111-1111'])(
        'sigue rechazando lo que no tiene forma de uuid: %s',
        value => {
            expect(isUuid(value)).toBe(false);
        },
    );
});

describe('Agent Center: degradacion visible del planner', () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;

    afterEach(() => {
        if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = originalKey;
    });

    it('reporta la falta de API key en vez de degradar en silencio', () => {
        delete process.env.ANTHROPIC_API_KEY;
        const degradation = plannerUnavailableDegradation();
        expect(degradation?.reason).toBe('missing_api_key');
        expect(degradation?.detail).toContain('ANTHROPIC_API_KEY');
    });

    it('no reporta degradacion cuando la key esta configurada', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
        expect(plannerUnavailableDegradation()).toBeNull();
    });

    it('distingue el bloqueo por presupuesto de un error de la API', () => {
        const blocked = plannerDegradationFromError(new AiBudgetExceededError('La comunidad alcanzo su bolsa mensual de IA.'));
        expect(blocked.reason).toBe('budget_blocked');
        expect(blocked.detail).toContain('bolsa mensual');

        expect(plannerDegradationFromError(new Error('socket hang up')).reason).toBe('api_error');
    });
});
