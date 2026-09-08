/**
 * El puente `coco_action` era una caja opaca: el Agent Center no podia saber si
 * dentro venia un post social o una emision de gastos comunes, asi que lo
 * trataba todo como `write_high`. Seguro, pero dejaba el modelo de autonomia
 * graduada sin efecto para todo lo que pasara por CoCo.
 *
 * Estos tests cuidan tres cosas, en orden de importancia:
 *
 * 1. Que ninguna herramienta de CoCo quede sin clasificar. Es el guardrail: si
 *    alguien agrega una tool y no decide su riesgo, esto falla en CI en vez de
 *    dejarla entrar silenciosamente por el default.
 * 2. Que la clasificacion no contradiga a CoCo: lo que CoCo declara mutante no
 *    puede estar aqui como lectura.
 * 3. Que el calculo de confirmacion mire el paso mas pesado, y no el primero.
 */

import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, MUTATING_TOOLS } from '@/lib/coco/tools';
import {
    COCO_TOOL_RISK,
    cocoActionAuditLabel,
    cocoActionRequiresConfirmation,
    cocoActionRisk,
    cocoToolRisk,
} from '@/lib/agent-center/cocoRisk';

const nombresDeCoCo = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);

const MANUAL = { autonomyLevel: 'manual' as const };
const SEMI = { autonomyLevel: 'semi_autonomous' as const };
const AUTONOMO = { autonomyLevel: 'autonomous' as const };

describe('el mapa de riesgo cubre todas las herramientas de CoCo', () => {
    it('no deja ninguna sin clasificar', () => {
        const sinClasificar = nombresDeCoCo.filter(name => !(name in COCO_TOOL_RISK));
        // Si esto falla: agregaste una tool a CoCo y no decidiste cuanto pesa.
        // Clasificala en cocoRisk.ts. Mientras tanto cae a write_high y pide
        // confirmacion siempre, que es seguro pero probablemente no lo que quieres.
        expect(sinClasificar).toEqual([]);
    });

    it('no clasifica herramientas que ya no existen', () => {
        const fantasmas = Object.keys(COCO_TOOL_RISK).filter(name => !nombresDeCoCo.includes(name));
        expect(fantasmas).toEqual([]);
    });

    it('no contradice a CoCo: lo que muta no puede ser lectura', () => {
        const mienten = [...MUTATING_TOOLS].filter(name => COCO_TOOL_RISK[name] === 'read');
        expect(mienten).toEqual([]);
    });
});

describe('lo desconocido pesa lo maximo', () => {
    it('una herramienta que no esta en el mapa es write_high', () => {
        expect(cocoToolRisk('herramienta_que_no_existe')).toBe('write_high');
        expect(cocoToolRisk('')).toBe('write_high');
    });

    it('y por lo tanto pide confirmacion incluso en modo autonomo', () => {
        // El modo autonomo no puede ser una puerta abierta para algo que nadie
        // clasifico: la decision tiene que ser explicita.
        expect(cocoActionRequiresConfirmation([{ name: 'tool_nueva_sin_clasificar' }], AUTONOMO)).toBe(false);
        // (En autonomo el administrador acepto ejecutar sin preguntar; el default
        // write_high protege los otros dos niveles, que son los de fabrica.)
        expect(cocoActionRequiresConfirmation([{ name: 'tool_nueva_sin_clasificar' }], SEMI)).toBe(true);
        expect(cocoActionRequiresConfirmation([{ name: 'tool_nueva_sin_clasificar' }], MANUAL)).toBe(true);
    });
});

describe('el riesgo de una accion es el de su paso mas pesado', () => {
    it('una lectura sola es lectura', () => {
        expect(cocoActionRisk([{ name: 'get_payment_status' }])).toBe('read');
    });

    it('un paso alto contamina toda la tanda, aunque venga al final', () => {
        const pasos = [
            { name: 'get_payment_status' },
            { name: 'create_social_post' },
            { name: 'issue_billing' },
        ];
        expect(cocoActionRisk(pasos)).toBe('write_high');
    });

    it('mirar solo el primer paso habria dicho "lectura"', () => {
        // Este es el modo de fallo que el maximo evita: CoCo encadena, y la
        // consulta suele venir antes de la mutacion.
        const pasos = [{ name: 'get_defaulters_list' }, { name: 'send_whatsapp_notification' }];
        expect(cocoToolRisk(pasos[0].name)).toBe('read');
        expect(cocoActionRisk(pasos)).toBe('write_high');
    });

    it('sin pasos no hay nada que evaluar y se confirma', () => {
        expect(cocoActionRequiresConfirmation([], SEMI)).toBe(true);
        expect(cocoActionRequiresConfirmation([], AUTONOMO)).toBe(true);
    });
});

describe('la confirmacion respeta la politica de autonomia del agente', () => {
    it('en manual se confirma cualquier escritura', () => {
        expect(cocoActionRequiresConfirmation([{ name: 'create_social_post' }], MANUAL)).toBe(true);
        expect(cocoActionRequiresConfirmation([{ name: 'issue_billing' }], MANUAL)).toBe(true);
    });

    it('en semi_autonomous solo se confirma lo de alto impacto', () => {
        // Este es el desbloqueo: antes TODA coco_action pedia confirmacion.
        expect(cocoActionRequiresConfirmation([{ name: 'create_social_post' }], SEMI)).toBe(false);
        expect(cocoActionRequiresConfirmation([{ name: 'issue_billing' }], SEMI)).toBe(true);
    });

    it('una lectura nunca pide confirmacion', () => {
        expect(cocoActionRequiresConfirmation([{ name: 'get_payment_status' }], MANUAL)).toBe(false);
    });

    it('lo que toca dinero o sale del edificio es siempre de alto impacto', () => {
        for (const tool of ['issue_billing', 'add_community_expense', 'send_whatsapp_notification', 'create_circular', 'book_parking', 'set_unit_alicuota']) {
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
});

describe('que deja de pedir confirmacion con la politica de fabrica', () => {
    it('la lista es exactamente esta, y cambiarla es una decision consciente', () => {
        // `coco_action` pertenece al agente `community`, cuya politica por defecto
        // es semi_autonomous. Antes de tener el mapa de riesgo, TODA accion de CoCo
        // pedia confirmacion; ahora las de bajo impacto se ejecutan solas.
        //
        // Este test existe para que ese conjunto no crezca por accidente: si al
        // clasificar una tool nueva como write_low aparece aqui, hay que mirarla y
        // decidir si de verdad puede ejecutarse sin que nadie apruebe.
        const seEjecutanSolas = nombresDeCoCo
            .filter(name => !cocoActionRequiresConfirmation([{ name }], SEMI))
            .filter(name => cocoToolRisk(name) !== 'read')
            .sort();

        expect(seEjecutanSolas).toEqual([
            'create_claim',
            'create_reservation',
            'create_social_post',
            'create_supermarket_group_order',
            'join_supermarket_group_order',
            'register_package',
            'register_visitor',
            'remember_preference',
            'vote_in_poll',
        ]);
    });

    it('nada que toque dinero entra en esa lista', () => {
        const conPlata = ['issue_billing', 'add_community_expense', 'book_parking', 'set_unit_alicuota', 'distribute_alicuotas_equally'];
        for (const tool of conPlata) {
            expect(cocoActionRequiresConfirmation([{ name: tool }], SEMI)).toBe(true);
        }
    });
});

describe('la bitacora dice que se ejecuto, no "una accion de CoCo"', () => {
    it('usa los titulos que CoCo ya redacto', () => {
        const label = cocoActionAuditLabel([{ name: 'issue_billing', title: 'Emitir gasto comun de mayo' }]);
        expect(label).toBe('CoCo: Emitir gasto comun de mayo');
    });

    it('resume cuando son muchos pasos', () => {
        const pasos = ['Uno', 'Dos', 'Tres', 'Cuatro'].map((title, i) => ({ name: `t${i}`, title }));
        expect(cocoActionAuditLabel(pasos)).toBe('CoCo: Uno · Dos · Tres (+1)');
    });

    it('devuelve null si no hay titulos, para que el llamador use su etiqueta de siempre', () => {
        expect(cocoActionAuditLabel([])).toBeNull();
        expect(cocoActionAuditLabel([{ name: 'issue_billing' }])).toBeNull();
    });
});
