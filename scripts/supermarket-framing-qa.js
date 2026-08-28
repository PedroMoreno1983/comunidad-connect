/**
 * Comprueba que la bandera `framable` de cada tienda siga siendo cierta.
 *
 * El cargador de carros mete cada producto en un iframe oculto del mismo
 * origen, lo que exige que la tienda permita auto-enmarcarse. Esa condición
 * está escrita a mano en public/coco-cargador.js como `framable: true|false`,
 * es decir: una suposición sobre un sitio ajeno que cambia cuando quiere.
 *
 * Jumbo pasó a X-Frame-Options: DENY entre julio y agosto de 2026. La bandera
 * siguió diciendo `true`, así que el cargador intentaba enmarcar, fallaba en
 * cada producto y no cargaba nada. Nadie se enteró hasta que un usuario lo
 * reporto: ninguna prueba miraba las cabeceras reales de las tiendas.
 *
 * Este guard las mira. No falla la build por un sitio caido o lento —seria un
 * test que se rompe solo—, pero si una tienda marcada como enmarcable responde
 * DENY de forma inequivoca, avisa con codigo 1.
 *
 * Uso:  npm run qa:supermarket-framing
 */

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Extrae { tienda: { framable, searchUrl } } del cargador, sin ejecutarlo. */
function leerTiendas() {
    const fuente = fs.readFileSync(path.join(process.cwd(), 'public', 'coco-cargador.js'), 'utf8');
    const bloque = /^\s{4}'?([A-Za-z ]+)'?: \{([\s\S]*?)^\s{4}\},$/gm;
    const tiendas = [];
    let match;
    while ((match = bloque.exec(fuente))) {
        const nombre = match[1].trim();
        const cuerpo = match[2];
        const framable = /framable:\s*true/.test(cuerpo);
        const url = /searchUrl:\s*q\s*=>\s*`([^`]+)`/.exec(cuerpo);
        if (!url) continue;
        tiendas.push({
            nombre,
            framable,
            // La plantilla usa ${encodeURIComponent(q)}: se reemplaza por un
            // termino real para pedir la misma URL que pediria el cargador.
            url: url[1].replace(/\$\{encodeURIComponent\(q\)\}/g, 'leche'),
        });
    }
    return tiendas;
}

async function cabeceras(url) {
    const control = new AbortController();
    const corte = setTimeout(() => control.abort(), 25_000);
    try {
        const respuesta = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: { 'User-Agent': UA },
            signal: control.signal,
        });
        return {
            xfo: (respuesta.headers.get('x-frame-options') || '').toLowerCase(),
            csp: (respuesta.headers.get('content-security-policy') || '').toLowerCase(),
        };
    } finally {
        clearTimeout(corte);
    }
}

async function main() {
    const report = { generatedAt: new Date().toISOString(), passed: false, checks: [], failures: [], skipped: [] };

    for (const tienda of leerTiendas()) {
        if (!tienda.framable) {
            report.checks.push({ name: `${tienda.nombre}: declarada NO enmarcable, se usa el modo asistido` });
            continue;
        }

        let cab;
        try {
            cab = await cabeceras(tienda.url);
        } catch (error) {
            // Un sitio caido o lento no es un fallo nuestro.
            report.skipped.push(`${tienda.nombre}: no respondio (${error.name || 'error'}).`);
            continue;
        }

        const bloqueaXfo = cab.xfo.includes('deny');
        const bloqueaCsp = /frame-ancestors\s+'none'/.test(cab.csp);

        if (bloqueaXfo || bloqueaCsp) {
            report.failures.push({
                message:
                    `${tienda.nombre} esta marcada como enmarcable pero ya bloquea el enmarcado. `
                    + 'El cargador fallara en cada producto de esa tienda. '
                    + `Poner framable: false en public/coco-cargador.js.`,
                details: { xFrameOptions: cab.xfo || null, csp: bloqueaCsp ? "frame-ancestors 'none'" : null },
            });
        } else {
            report.checks.push({ name: `${tienda.nombre}: sigue permitiendo el enmarcado` });
        }
    }

    report.passed = report.failures.length === 0;
    return report;
}

main()
    .then(report => {
        console.log(JSON.stringify(report, null, 2));
        if (!report.passed) process.exit(1);
    })
    .catch(error => {
        console.error(JSON.stringify({ passed: false, failures: [{ message: error.message }] }, null, 2));
        process.exit(1);
    });
