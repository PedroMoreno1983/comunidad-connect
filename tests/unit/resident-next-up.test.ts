import { describe, expect, it } from 'vitest';
import { agreementDueDates } from '@/lib/finance/operationalFlows';
import { buildResidentNextUp, chargeReferenceDate, nextBooking, nextCharge, nextEvent, nextInstallment } from '@/lib/home/nextUp';
import {
  NEXT_UP_FORBIDDEN_LANGUAGE,
  agreementRequestFromHomeAdminCopy,
  AGREEMENT_REQUEST_FROM_HOME_SENT,
  bookingCopy,
  chargeCopy,
  eventCopy,
  installmentCopy,
} from '@/lib/home/nextUpCopy';
import { checkEligibilityPrivacy } from '@/lib/assemblies/eligibilityCopy';
import type { PaymentAgreement, StatementChargeBalance } from '@/lib/types';

const TODAY = '2026-10-18';

function charge(partial: Partial<StatementChargeBalance> & { id: string }): StatementChargeBalance {
  return { kind: 'gasto_comun', label: 'Gasto común', month: '2026-10', dueDate: null, amount: 85_000, outstandingAmount: 85_000, ...partial };
}

function agreement(partial: Partial<PaymentAgreement> = {}): PaymentAgreement {
  const due = agreementDueDates('2026-10-14', 4);
  return {
    id: 'ag-1', unitId: 'unit-1', unitLabel: '101', title: 'Convenio 2026', totalAmount: 160_000, installmentCount: 4,
    status: 'active', committeeReviewerId: null, committeeReviewedAt: null, committeeReviewNote: null, notes: '',
    createdAt: '2026-10-14T15:00:00Z', paidAmount: 40_000,
    installments: due.map((dueDate, index) => ({
      id: `inst-${index + 1}`, sequence: index + 1, dueDate, amount: 40_000,
      status: index === 0 ? 'paid' : 'pending', paidAt: index === 0 ? '2026-10-14' : null,
    })),
    ...partial,
  };
}

describe('nextCharge (cartola unificada expenses + unit_charges)', () => {
  it('sin saldo abierto, la cuenta queda al día', () => {
    const result = nextCharge([charge({ id: 'e1', outstandingAmount: 0 })], [], TODAY);
    expect(result.state).toBe('clear');
    expect(result.amount).toBe(0);
  });

  it('muestra el próximo vencimiento futuro con su monto', () => {
    const result = nextCharge([
      charge({ id: 'e2', month: '2026-11', dueDate: '2026-11-05', outstandingAmount: 90_000 }),
      charge({ id: 'c1', kind: 'extraordinary', month: '2026-12', dueDate: '2026-12-05', outstandingAmount: 20_000 }),
    ], [], TODAY);
    expect(result).toMatchObject({ state: 'upcoming', dueDate: '2026-11-05', amount: 90_000, label: 'Gasto común de noviembre', otherOpenCount: 1 });
  });

  it('si algo quedó abierto, suma lo pendiente y parte por lo más antiguo', () => {
    const result = nextCharge([
      charge({ id: 'e1', month: '2026-09', dueDate: '2026-09-05', outstandingAmount: 30_000 }),
      charge({ id: 'e2', month: '2026-10', dueDate: '2026-10-05', outstandingAmount: 85_000 }),
      charge({ id: 'e3', month: '2026-11', dueDate: '2026-11-05', outstandingAmount: 85_000 }),
    ], [], TODAY);
    expect(result).toMatchObject({ state: 'open', dueDate: '2026-09-05', amount: 115_000, otherOpenCount: 2 });
  });

  it('un cobro sin vencimiento se ordena por el fin de su mes', () => {
    expect(chargeReferenceDate({ dueDate: null, month: '2026-02' })).toBe('2026-02-28');
  });

  it('no nombra multas ni intereses: son "otro cargo"', () => {
    const result = nextCharge([charge({ id: 'f1', kind: 'fine', label: 'Multa ruidos molestos', month: '2026-11', dueDate: '2026-11-10' })], [], TODAY);
    expect(result.label).toBe('Otro cargo de noviembre');
  });

  it('un convenio vigente cubre lo vencido hasta el día en que se abrió', () => {
    const result = nextCharge([
      charge({ id: 'e1', month: '2026-09', dueDate: '2026-09-05' }),
      charge({ id: 'e2', month: '2026-10', dueDate: '2026-10-05' }),
      charge({ id: 'e3', month: '2026-11', dueDate: '2026-11-05', outstandingAmount: 88_000 }),
    ], [agreement()], TODAY, 'unit-1');
    expect(result).toMatchObject({ state: 'upcoming', dueDate: '2026-11-05', amount: 88_000, otherOpenCount: 0 });
  });

  it('el convenio de otra unidad no esconde cobros de esta', () => {
    const result = nextCharge([charge({ id: 'e1', month: '2026-09', dueDate: '2026-09-05' })], [agreement({ unitId: 'unit-2' })], TODAY, 'unit-1');
    expect(result.state).toBe('open');
  });
});

describe('nextInstallment (agreementDueDates)', () => {
  it('toma la primera cuota pendiente de un convenio vigente', () => {
    // Firmado el 14/10: 14/10, 5/11, 5/12, 5/1.
    expect(nextInstallment([agreement()])).toMatchObject({ sequence: 2, installmentCount: 4, dueDate: '2026-11-05', amount: 40_000 });
  });

  it('un convenio en revisión del comité o cerrado no tiene próxima cuota', () => {
    expect(nextInstallment([agreement({ status: 'pending_committee' }), agreement({ id: 'x', status: 'cancelled' })])).toBeNull();
  });
});

describe('reserva y evento', () => {
  it('la próxima reserva ignora canceladas y las de hoy que ya terminaron', () => {
    const booking = nextBooking([
      { id: 'b0', date: TODAY, start_time: '08:00:00', end_time: '09:00:00', status: 'confirmed', amenityName: 'Gimnasio' },
      { id: 'b1', date: '2026-10-20', start_time: '18:00:00', end_time: '20:00:00', status: 'cancelled', amenityName: 'Quincho' },
      { id: 'b2', date: '2026-10-25', start_time: '13:00:00', end_time: '17:00:00', status: 'pending', amenityName: 'Quincho' },
    ], TODAY, '12:30');
    expect(booking).toMatchObject({ id: 'b2', startTime: '13:00', endTime: '17:00', status: 'pending' });
  });

  it('una asamblea en curso va primero; si no, la próxima citada', () => {
    const rows = [
      { id: 'a1', title: 'Asamblea ordinaria', scheduled_at: '2026-10-28T22:00:00Z', modality: 'hybrid', location: 'Sala multiuso', status: 'cited' },
      { id: 'a2', title: 'Asamblea extraordinaria', scheduled_at: '2026-10-18T22:00:00Z', modality: 'remote', location: '', status: 'in_progress' },
    ];
    expect(nextEvent(rows, TODAY)?.id).toBe('a2');
    expect(nextEvent([rows[0]], TODAY)).toMatchObject({ id: 'a1', modality: 'hybrid', inProgress: false });
    expect(nextEvent([{ ...rows[0], scheduled_at: '2026-10-10T22:00:00Z' }], TODAY)).toBeNull();
  });
});

describe('textos: comunidad, sin lenguaje de deudor y con salida', () => {
  const states = [
    nextCharge([], [], TODAY),
    nextCharge([charge({ id: 'e', month: '2026-11', dueDate: '2026-11-05' })], [], TODAY),
    nextCharge([charge({ id: 'e', month: '2026-11', dueDate: TODAY })], [], TODAY),
    nextCharge([charge({ id: 'e1', month: '2026-09', dueDate: '2026-09-05' }), charge({ id: 'e2', month: '2026-10', dueDate: '2026-10-05' })], [], TODAY),
  ];

  it('ningún texto usa lenguaje de deudor ni amenazas', () => {
    const texts = [
      ...states.flatMap(state => { const copy = chargeCopy(state, TODAY); return [copy.title, copy.detail, copy.note ?? '']; }),
      ...[installmentCopy(nextInstallment([agreement()])!, TODAY)].flatMap(copy => [copy.title, copy.detail]),
      ...[installmentCopy({ ...nextInstallment([agreement()])!, dueDate: '2026-10-01' }, TODAY)].flatMap(copy => [copy.detail]),
      bookingCopy({ id: 'b', amenityName: 'Quincho', date: '2026-10-19', startTime: '18:00', endTime: '20:00', status: 'pending' }, TODAY).detail,
      eventCopy({ id: 'a', title: 'Asamblea ordinaria', scheduledAt: '2026-10-28T22:00:00Z', modality: 'hybrid', location: '', inProgress: false }, TODAY, '2026-10-28').detail,
      AGREEMENT_REQUEST_FROM_HOME_SENT,
    ];
    for (const text of texts) {
      expect(text, text).not.toMatch(NEXT_UP_FORBIDDEN_LANGUAGE);
      expect(checkEligibilityPrivacy(text).filter(problem => problem === 'lenguaje de deudor'), text).toEqual([]);
    }
  });

  it('lo pendiente siempre ofrece una salida: pagar en línea, conversar o un convenio', () => {
    const open = chargeCopy(states[3], TODAY);
    expect(open.detail).toMatch(/en línea/);
    expect(open.detail).toMatch(/conversemos|convenio/);
    expect(open.amount).toBe(170_000);
  });

  it('el aviso a la administración no lleva montos', () => {
    const copy = agreementRequestFromHomeAdminCopy('B-204');
    expect(checkEligibilityPrivacy(`${copy.title} ${copy.body}`)).toEqual([]);
  });

  it('fechas legibles en español de Chile', () => {
    expect(chargeCopy(states[1], TODAY).detail).toBe('Vence el 5 de noviembre (en 18 días).');
    expect(chargeCopy(states[2], TODAY).detail).toMatch(/^Vence hoy/);
    expect(bookingCopy({ id: 'b', amenityName: 'Quincho', date: '2026-10-19', startTime: '18:00', endTime: '20:00', status: 'confirmed' }, TODAY).detail)
      .toBe('Mañana, de 18:00 a 20:00.');
  });
});

describe('buildResidentNextUp', () => {
  it('arma la tarjeta completa y sabe si ya hay convenio', () => {
    const result = buildResidentNextUp({
      today: TODAY, unitId: 'unit-1', now: new Date('2026-10-18T15:00:00Z'),
      chargeBalances: [charge({ id: 'e3', month: '2026-11', dueDate: '2026-11-05' })],
      agreements: [agreement()],
      bookings: [{ id: 'b', date: '2026-10-19', start_time: '18:00', end_time: '20:00', status: 'confirmed', amenityName: 'Quincho' }],
      assemblies: [],
    });
    expect(result.charge.state).toBe('upcoming');
    expect(result.installment?.dueDate).toBe('2026-11-05');
    expect(result.booking?.amenityName).toBe('Quincho');
    expect(result.event).toBeNull();
    expect(result.hasAgreement).toBe(true);
  });
});
