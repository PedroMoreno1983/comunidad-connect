# Integración contable de finanzas

Estado: implementación parcial. Este documento registra las reglas técnicas y las decisiones que deben validarse antes de presentar el libro como contabilidad completa de una comunidad.

## Fuente operativa y libro

Los estados de resultado, caja y situación actuales se calculan desde `expenses`, `unit_charges`, `unit_payments`, `community_expenses` y `reserve_fund_movements`. El libro `journal_entries` contiene asientos manuales, remuneraciones y, desde la migración `finance_payment_atomic_journal`, cada pago nuevo de unidad. No se debe inferir que el libro ya cubre todos los movimientos.

Los asientos manuales se guardan con todas sus líneas en una transacción; una línea inválida o un descuadre cancela el asiento completo.

| Evento | Tratamiento técnico actual | Regla contable por confirmar |
| --- | --- | --- |
| Pago de unidad | Debe Banco 1100, Haber Cuentas por cobrar 1200; mismo commit del pago. Al eliminarlo se genera una reversa. | Separar efectivo, cheques y medios por conciliar; tratar los anticipos cuando la unidad no tiene deuda. |
| Cuota de convenio | El pago usa el asiento de `unit_payments`; la cuota y el pago se confirman juntos. | Confirmar si un convenio solo reprograma deuda existente o crea un cargo nuevo en casos particulares. |
| Emisión de gasto común | Aún no crea asiento automático. | Debe Cuentas por cobrar; Haber ingresos y fondo de reserva según desglose validado. |
| Cargo individual o descuento | Aún no crea asiento automático. | Cuentas de multa, interés, servicio y contraingreso del descuento. |
| Egreso comunitario | El estado operativo lo trata como salida de caja del mes; el libro no lo genera automáticamente. | Distinguir factura devengada de pago efectivo, fecha de pago, proveedor y cuenta por pagar. |
| Fondo de reserva | Libro operativo separado; sin asiento automático. | Confirmar cuenta patrimonial y si existe banco separado. |
| Remuneración | Al confirmar el pago, crea egreso, asiento y estado pagado en una transacción. La preparación del borrador todavía usa llamadas separadas. | Distinguir devengo, obligación, pago y retenciones; el asiento actual registra gasto contra banco al pagar. |

## Reglas de publicación

1. No reemplazar estados operativos por saldos del libro hasta que el contador valide el plan de cuentas, el saldo inicial y un mes completo.
2. No inventar asientos históricos. Conciliar saldos de apertura con respaldo; preservar los cortes ya guardados.
3. Cada movimiento nuevo debe generar su asiento en la misma transacción. Errores de contabilización deben impedir confirmar el movimiento.
4. El cierre debe comparar subtotales operativos con libro por cuenta y por período, mostrar diferencias y bloquear el cierre cuando existan diferencias sin resolver.
5. Probar creación, corrección, reversa, reintento, cambio de año, tenant equivocado, usuario anónimo y usuario autenticado sin permiso antes de activar cada flujo.

## Pendientes de validación profesional

- Base de registro y fecha contable de egresos: devengo frente a pago.
- Plan jerárquico definitivo y asignación de categorías a cuentas.
- Separación de fondos y conciliación de bancos/caja/medios en tránsito.
- Tratamiento de anticipos, descuentos, intereses, multas y convenios.
- Saldo de apertura respaldado para cada comunidad y fecha de adopción.
- Revisión del plan de cuentas y del primer cierre por un contador cuando haya uno disponible. Hasta entonces el libro es auxiliar y los estados operativos no se presentan como contabilidad oficial.

La pasarela de pago y la conexión bancaria quedan fuera de esta etapa, según lo indicado por el propietario del producto.
