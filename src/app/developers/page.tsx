import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: 'API para desarrolladores',
    description: 'API REST de solo lectura de Convive Connect: unidades, cobros, pagos, saldos, rendición y accesos.',
    alternates: { canonical: '/developers' },
};

const ENDPOINTS = [
    { method: 'GET', path: '/api/v1/units', scope: 'units', description: 'Unidades de la comunidad con torre, piso y alícuota (por mil).' },
    { method: 'GET', path: '/api/v1/charges?month=AAAA-MM', scope: 'finance', description: 'Cobros de gasto común emitidos en el mes, con estado y fecha de pago.' },
    { method: 'GET', path: '/api/v1/payments?from=AAAA-MM-DD&to=AAAA-MM-DD', scope: 'finance', description: 'Pagos registrados en el rango (por defecto, el mes en curso).' },
    { method: 'GET', path: '/api/v1/balances', scope: 'finance', description: 'Saldo, deuda vencida y mes más antiguo adeudado por unidad.' },
    { method: 'GET', path: '/api/v1/reports/monthly?month=AAAA-MM', scope: 'finance', description: 'Rendición del mes: egresos por categoría, cobrado, recaudado y fondo de reserva.' },
    { method: 'GET', path: '/api/v1/visitors?since=AAAA-MM-DD', scope: 'access', description: 'Ingresos de visitas desde la fecha (por defecto, hoy).' },
];

const CURL = `curl https://conviveconnect.com/api/v1/charges?month=2026-09 \\
  -H "Authorization: Bearer cc_live_xxxxxxxx_..."`;

const RESPONSE = `{
  "data": [
    { "id": "…", "unitNumber": "402", "month": "2026-09",
      "amount": 98500, "status": "paid", "dueDate": "2026-10-10", "paidAt": "2026-10-04" }
  ]
}`;

const VERIFY = `// Node.js: verificar el aviso del portón
import { createHmac, timingSafeEqual } from 'node:crypto';

function isFromConvive(req, rawBody, secret) {
  const timestamp = req.headers['x-coco-timestamp'];
  const expected = 'sha256=' + createHmac('sha256', secret).update(\`\${timestamp}.\${rawBody}\`).digest('hex');
  const received = req.headers['x-coco-signature'] || '';
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return fresh && received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}`;

function Code({ children }: { children: string }) {
    return (
        <pre className="overflow-x-auto rounded-xl border p-4 text-xs leading-6" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
            <code className="cc-text-primary">{children}</code>
        </pre>
    );
}

export default function DevelopersPage() {
    return (
        <main className="min-h-screen px-4 py-10" style={{ background: 'var(--cc-ivory)' }}>
            <div className="mx-auto max-w-3xl space-y-10">
                <Link href="/" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Convive Connect
                </Link>
                <header className="space-y-3">
                    <h1 className="text-4xl font-semibold cc-text-primary" style={{ fontFamily: 'var(--cc-font-display)' }}>API para desarrolladores</h1>
                    <p className="cc-text-secondary">
                        Conecta la contabilidad, el banco o el control de acceso de una comunidad. La API es REST, de solo lectura,
                        responde JSON y nunca entrega correos, teléfonos ni RUT de residentes.
                    </p>
                </header>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold cc-text-primary">Autenticación</h2>
                    <p className="text-sm cc-text-secondary">
                        La administración crea una clave en <strong>Administración → Operaciones → API pública</strong> y elige sus permisos
                        (<code>units</code>, <code>finance</code>, <code>access</code>). La clave se muestra una sola vez; guardamos solo su huella.
                        Cada clave da acceso a una sola comunidad y se puede revocar en cualquier momento.
                    </p>
                    <Code>{CURL}</Code>
                    <p className="text-sm cc-text-secondary">
                        Todas las respuestas tienen la forma <code>{'{ "data": … }'}</code> o <code>{'{ "error": "…" }'}</code>.
                        Errores: <code>401</code> clave inválida o revocada, <code>403</code> falta el permiso, <code>429</code> más de 120 consultas por minuto.
                        Cada consulta devuelve hasta 1.000 filas.
                    </p>
                    <Code>{RESPONSE}</Code>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold cc-text-primary">Endpoints</h2>
                    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                        <table className="w-full text-sm">
                            <thead style={{ background: 'var(--cc-paper-warm)' }}>
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold cc-text-secondary">Ruta</th>
                                    <th className="px-4 py-2 text-left font-semibold cc-text-secondary">Permiso</th>
                                    <th className="px-4 py-2 text-left font-semibold cc-text-secondary">Devuelve</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ENDPOINTS.map(endpoint => (
                                    <tr key={endpoint.path} className="border-t align-top" style={{ borderColor: 'var(--cc-line)' }}>
                                        <td className="px-4 py-2"><code className="text-xs cc-text-primary">{endpoint.method} {endpoint.path}</code></td>
                                        <td className="px-4 py-2"><code className="text-xs">{endpoint.scope}</code></td>
                                        <td className="px-4 py-2 cc-text-secondary">{endpoint.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold cc-text-primary">Portón automático (webhook)</h2>
                    <p className="text-sm cc-text-secondary">
                        Cuando conserjería deja pasar una visita aprobada por el citófono digital, enviamos un <code>POST</code> JSON al controlador
                        configurado, con el evento <code>access.granted</code>, la unidad y el nombre de la visita. Verifica la firma antes de abrir
                        y rechaza avisos con más de 5 minutos.
                    </p>
                    <Code>{VERIFY}</Code>
                </section>
            </div>
        </main>
    );
}
