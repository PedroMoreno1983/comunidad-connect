/**
 * Impide que `supabase config push` pise la configuracion de produccion.
 *
 * `config push` no envia solo lo que escribes: manda la seccion [auth]
 * COMPLETA. Toda clave que config.toml no declare viaja con el valor por
 * defecto del CLI, que son defaults de desarrollo local.
 *
 * Eso paso el 2026-08-25. El archivo declaraba unicamente el bloque SMTP y
 * el push desactivo en produccion la confirmacion de correo y el MFA, bajo
 * el OTP de 8 a 6 digitos y el intervalo minimo entre correos de 1 minuto a
 * 1 segundo. Nada de eso se pidio: viajo de polizon.
 *
 * La regla que verifica este guard: si config.toml declara CUALQUIER cosa
 * bajo auth, entonces tiene que declarar todas las claves sensibles. Asi el
 * push nunca puede cambiar algo que nadie escribio.
 *
 * Uso directo:   npm run qa:supabase-config
 * Uso protegido: npm run supabase:config-push   <- corre esto antes de empujar
 */

const fs = require('fs');
const path = require('path');

/**
 * Claves que el CLI rellena con sus defaults si no se declaran.
 * Cada una de estas piso produccion en el incidente del 2026-08-25.
 */
const CLAVES_REQUERIDAS = [
    ['auth', 'site_url'],
    ['auth', 'additional_redirect_urls'],
    ['auth', 'jwt_expiry'],
    ['auth', 'enable_refresh_token_rotation'],
    ['auth.mfa.totp', 'enroll_enabled'],
    ['auth.mfa.totp', 'verify_enabled'],
    ['auth.email', 'enable_signup'],
    ['auth.email', 'double_confirm_changes'],
    ['auth.email', 'enable_confirmations'],
    ['auth.email', 'secure_password_change'],
    ['auth.email', 'max_frequency'],
    ['auth.email', 'otp_length'],
    ['auth.email', 'otp_expiry'],
];

/** Parser minimo de TOML: sirve porque config.toml solo usa secciones y claves planas. */
function parseSecciones(toml) {
    const secciones = {};
    let actual = '';
    for (const linea of toml.split(/\r?\n/)) {
        const limpia = linea.trim();
        if (!limpia || limpia.startsWith('#')) continue;

        const cabecera = /^\[([^\]]+)\]$/.exec(limpia);
        if (cabecera) {
            actual = cabecera[1];
            secciones[actual] = secciones[actual] || new Set();
            continue;
        }

        const clave = /^([A-Za-z0-9_]+)\s*=/.exec(limpia);
        if (clave && actual) secciones[actual].add(clave[1]);
    }
    return secciones;
}

function main() {
    const archivo = path.join(process.cwd(), 'supabase', 'config.toml');
    const report = { generatedAt: new Date().toISOString(), passed: false, checks: [], failures: [] };

    if (!fs.existsSync(archivo)) {
        report.passed = true;
        report.checks.push({ name: 'No hay supabase/config.toml: nada que empujar' });
        return report;
    }

    const secciones = parseSecciones(fs.readFileSync(archivo, 'utf8'));
    const tocaAuth = Object.keys(secciones).some(nombre => nombre === 'auth' || nombre.startsWith('auth.'));

    if (!tocaAuth) {
        report.passed = true;
        report.checks.push({ name: 'config.toml no declara nada bajo auth: el push no puede alterarla' });
        return report;
    }

    const faltantes = CLAVES_REQUERIDAS
        .filter(([seccion, clave]) => !secciones[seccion] || !secciones[seccion].has(clave))
        .map(([seccion, clave]) => `${seccion}.${clave}`);

    if (faltantes.length) {
        report.failures.push({
            message:
                'config.toml declara parte de [auth] pero no toda. `config push` enviaria las claves '
                + 'que faltan con los valores por defecto del CLI y pisaria produccion sin avisar. '
                + 'Declaralas con el valor real que tiene el proyecto antes de empujar.',
            details: { faltantes },
        });
    } else {
        report.checks.push({
            name: 'config.toml declara todas las claves sensibles de auth',
            details: { verificadas: CLAVES_REQUERIDAS.length },
        });
    }

    report.passed = report.failures.length === 0;
    return report;
}

const report = main();
console.log(JSON.stringify(report, null, 2));
if (!report.passed) {
    console.error('\nRevisa el diff que muestra el CLI antes de confirmar cualquier push.');
    process.exit(1);
}
