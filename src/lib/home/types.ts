/**
 * Tipos de "Lo próximo a la vista" (tarjeta del inicio del residente).
 * Viven aquí y no en src/lib/types.ts, que ya no se puede publicar por la API
 * de GitHub (ver AGENTS.md).
 */
import type { ReactNode } from 'react';
import type { PaymentAgreement, StatementChargeBalance } from '@/lib/types';

/** Estado del próximo vencimiento de la cuenta del residente. */
export type NextChargeState = 'clear' | 'upcoming' | 'open';

export interface NextChargeItem {
  state: NextChargeState;
  /** Fecha (AAAA-MM-DD) del cobro que se muestra: el próximo o el más antiguo abierto. */
  dueDate: string | null;
  /** Período AAAA-MM del cobro que se muestra. */
  month: string | null;
  /** Rótulo amable del cobro ("Gasto común de noviembre"). */
  label: string;
  /** Monto que se muestra: el del próximo cobro, o la suma de lo que ya pasó su fecha. */
  amount: number;
  /** Cobros que suma `amount` (1 si es el próximo; los vencidos si ya pasó la fecha). */
  includedCount: number;
  /** Otros cobros abiertos que NO están en `amount` (los que aún no vencen). */
  otherOpenCount: number;
}

export interface NextInstallmentItem {
  agreementId: string;
  agreementTitle: string;
  sequence: number;
  installmentCount: number;
  dueDate: string;
  amount: number;
}

export interface NextBookingItem {
  id: string;
  amenityName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed';
}

export interface NextEventItem {
  id: string;
  title: string;
  scheduledAt: string;
  modality: 'in_person' | 'remote' | 'hybrid';
  location: string;
  inProgress: boolean;
}

/** Lo que alimenta la tarjeta: todo sobre la cuenta y la agenda del propio residente. */
export interface ResidentNextUp {
  charge: NextChargeItem;
  installment: NextInstallmentItem | null;
  booking: NextBookingItem | null;
  event: NextEventItem | null;
  /** Hay un convenio vigente o en revisión: no se ofrece pedir otro. */
  hasAgreement: boolean;
}

export interface NextUpBookingRow {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  amenityName: string | null;
}

export interface NextUpAssemblyRow {
  id: string;
  title: string;
  scheduled_at: string;
  modality: string;
  location: string | null;
  status: string;
}

export interface BuildResidentNextUpInput {
  today: string;
  /** Unidad de la cartola (para saber qué convenio cubre sus cobros). */
  unitId?: string | null;
  chargeBalances: StatementChargeBalance[];
  agreements: PaymentAgreement[];
  bookings: NextUpBookingRow[];
  assemblies: NextUpAssemblyRow[];
  /** Instante actual, para eventos con hora. */
  now?: Date;
}

/** Props de la tarjeta "Lo próximo a la vista". */
export interface NextUpCardProps {
  nextUp: ResidentNextUp;
  /** Hoy en Chile (AAAA-MM-DD). */
  today: string;
}

/** Una fila de la tarjeta. */
export interface NextUpRowProps {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
  amount: number | null;
  note?: string;
  href: string;
  linkLabel: string;
}
