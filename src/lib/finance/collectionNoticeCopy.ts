/**
 * El aviso no puede prometer pago en línea cuando la pasarela no está configurada.
 * La transferencia y el comprobante siguen siendo el camino.
 */
export function collectionNoticeCopy(siteUrl: string, onlinePay: boolean): {
  emailButton: string;
  emailNote: string;
  pdfLine: string;
} {
  const cartola = `${siteUrl.replace(/\/$/, '')}/expenses`;
  if (onlinePay) {
    return {
      emailButton: 'Revisar y pagar',
      emailNote: 'El pago solo se registra cuando la pasarela envía una confirmación firmada.',
      pdfLine: `Paga en línea o revisa ${cartola}. Si transferiste, envía el comprobante.`,
    };
  }
  return {
    emailButton: 'Revisar el estado de cuenta',
    emailNote: 'El pago en línea no está activo. Si pagaste por transferencia, envía el comprobante a la administración.',
    pdfLine: `${cartola} · pago en línea no activo. Si transferiste, envía el comprobante.`,
  };
}
