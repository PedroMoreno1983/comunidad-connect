import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Cargar .env.local manualmente (sin imprimir secretos)
const env = Object.fromEntries(
    readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter(line => line.includes('=') && !line.startsWith('#'))
        .map(line => {
            const idx = line.indexOf('=');
            return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Comunidad del residente showcase (donde se verán los perfiles)
const COMMUNITY_ID = 'b392cf17-fd6b-47dd-b0b4-72b0e007824e';

// [email, nombre, oficio, celular] desde Oficios_Con_Celular.xlsx
const RAW = [
    ['jinostroza2002@hotmail.com', 'JOSÉ', 'Eléctrico', '084195144'],
    ['victor.gas2acevedo@gmail.com', 'VICTOR', 'Gas', '978412238'],
    ['manuel_17abril@hotmail.com', 'MANUEL NAVARRETE', 'Eléctrico', '56955298702'],
    ['thomas.jorquera.salinas@gmail.com', 'THOMAS JORQUERA', 'Eléctrico', '945058860'],
    ['ge.aviles.91@gmail.com', 'GERMÁN', 'Eléctrico', '972907513'],
    ['ivan.esteban.marin@gmail.com', 'IVÁN', 'Eléctrico', '8-4491044'],
    ['borispizarro@hotmail.com', 'BORIS', 'Eléctrico', '961854017'],
    ['rodolfo.letelierelectricidad@gmail.com', 'RODOLFO LETELIER', 'Eléctrico', '974452524'],
    ['ernesto1265@outlook.com', 'ERNESTO OVALLE', 'Eléctrico', '990710392'],
    ['jonathan.arias.h@gmail.com', 'JONATHAN', 'Eléctrico', '56958636335'],
    ['ramon.labra.arias@gmail.com', 'RAMÓN', 'Eléctrico', '78512900'],
    ['asmane.ltda@gmail.com', 'CRIATIAN', 'Eléctrico', '92669199'],
    ['buccionireyes@gmail.com', 'ERNESTO', 'Eléctrico', '93209459'],
    ['rledesma963@gmail.com', 'RAUL', 'Eléctrico', '997662996'],
    ['juanpedrorshqlf@gmail.com', 'JUAN PEDRO', 'Eléctrico', '984778037'],
    ['joel.arriagas@gmail.com', 'JOEL', 'Gas', '978384497'],
    ['subproyectos@gmail.com', 'SERGIO', 'Gas', '94525972'],
    ['jaimelectec@gmail.com', 'JAIME PATRICIO', 'Eléctrico', '09-0633023'],
    ['electricojmat@gmail.com', 'JOSE MANUEL', 'Eléctrico', '959028764'],
    ['npedropablo@gmail.com', 'PEDRO', 'Eléctrico', '973807714'],
    ['luislavm18@gmail.com', 'LUIS', 'Eléctrico', '992347459'],
    ['davidgarridoelectric@gmail.com', 'DAVID', 'Eléctrico', '56988608919'],
    ['alvsep@hotmail.com', 'ÁLVARO', 'Gas', '920835589'],
    ['prontoluz@gmail.com', 'JOSÉ', 'Eléctrico', '963946918'],
    ['ansoal@gmail.com', 'ANGEL', 'Gas', '75609921'],
    ['hildebrandol@gmail.com', 'HILDEBRANDO ANTONIO', 'Gas', '959847641'],
    ['fg.dylec@gmail.com', 'FELIPE', 'Eléctrico', '932272832'],
    ['j.andres.n6955@gmail.com', 'JAVIER', 'Eléctrico', '927514507'],
    ['elecpat60@gmail.com', 'PATRICIO', 'Eléctrico', '93688000'],
    ['lingeserc@gmail.com', 'LUIS', 'Gas', '56995367256'],
    ['gasfiteriaesfal@gmail.com', 'IVAN', 'Gas', '950844287'],
    ['erwinjalvarado@gmail.com', 'ERWIN', 'Eléctrico', '993706855'],
    ['s_contreras_rubilar@hotmail.com', 'SEBASTIÁN', 'Gas', '0989167298'],
    ['e.atenas.25@gmail.com', 'ERIK', 'Eléctrico', '992831514'],
    ['v.melo.diaz@hotmail.com', 'VICTOR', 'Gas', '988366278'],
    ['juan_hormapalm33@yahoo.com', 'JUAN', 'Gas', '995600614'],
    ['aas_gas@yahoo.com', 'HECTOR', 'Gas', '94906403'],
    ['samulav@outlook.com', 'RENATO', 'Eléctrico', '952632392'],
    ['jeresepul@gmail.com', 'JEREMY', 'Eléctrico', '923790817'],
    ['sulca231995@gmail.com', 'MICHEL', 'Eléctrico', '56959007815'],
    ['joaquin.contreras.m@hotmail.cl', 'JOAQUIN', 'Gas', '979336289'],
    ['elecprintelectricidad@gmail.com', 'JOSÉ', 'Eléctrico', '937583355'],
    ['sergio.llanquin79@gmail.com', 'SERGIO', 'Eléctrico', '962935465'],
    ['daguilera.delrio20@gmail.com', 'DAVID', 'Gas', '973477151'],
    ['marcelocorvera@gmail.com', 'MARCELO', 'Gas', '56984419873'],
    ['joolivar@gmail.com', 'JOSÉ', 'Eléctrico', '84043821'],
    ['claudiovalenzuel@gmail.com', 'CLAUDIO', 'Eléctrico', '945986813'],
    ['delfinweiss@hotmail.com', 'RICARDO', 'Gas', '56976213549'],
    ['tecnocontrol2@gmail.com', 'RUBEN MAURICIO', 'Eléctrico', '971007135'],
    ['brunoderis@hotmail.com', 'BRUNO', 'Eléctrico', '56991278655'],
    ['dgogarciavera@gmail.com', 'DIEGO', 'Eléctrico', '982743347'],
    ['aburgosing@gmail.com', 'ARMANDO', 'Eléctrico', '098248015'],
    ['garate.e@gmail.com', 'LEO', 'Gas', '920143689'],
    ['janillo.ortiz@gmail.com', 'ALEJANDRO', 'Eléctrico', '987505962'],
    ['erick23.velasquez.electronica@gmail.com', 'ERICK', 'Eléctrico', '951933446'],
    ['ignaciobg@live.cl', 'IGNACIO', 'Eléctrico', '966091886'],
    ['instalgonz@hotmail.com', 'FELIX', 'Eléctrico', '9-2541498'],
    ['sosthenenelson93@gmail.com', 'NELSON', 'Eléctrico', '971459962'],
    ['huerta.angelone@gmail.com', 'ANGELO', 'Eléctrico', '56996640864'],
    ['jaracristopher20@gmail.com', 'CRISTOPHER', 'Eléctrico', '56954194228'],
    ['abcingenieriaelectrica@gmail.com', 'ALVARO', 'Eléctrico', '88220180'],
    ['ainzunzat@gmail.com, ingenieria@emelec.cl', 'ALEJANDRO', 'Eléctrico', '972969276'],
    ['petersonjeanpierre99@gmail.com', 'JEAN PIERRE', 'Eléctrico', '984343304'],
];

function titleCase(name) {
    return name
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toLocaleUpperCase('es-CL') + word.slice(1))
        .join(' ');
}

function normalizePhone(raw) {
    let digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('56') && digits.length === 11) digits = digits.slice(2);
    digits = digits.replace(/^0+/, '');
    if (digits.length === 8) digits = '9' + digits;
    if (digits.length === 9 && digits.startsWith('9')) {
        return `+56 9 ${digits.slice(1, 5)} ${digits.slice(5)}`;
    }
    return digits ? `+56${digits}` : null;
}

const CATEGORY_MAP = { 'Eléctrico': 'electrical', 'Gas': 'plumbing' };

const CATEGORY_CONTENT = {
    electrical: {
        bio: 'Electricista disponible para trabajos domiciliarios en la comunidad: instalaciones, reparaciones, revisión de tableros y emergencias eléctricas.',
        specialties: ['Instalaciones eléctricas', 'Reparaciones domiciliarias', 'Emergencias eléctricas'],
    },
    plumbing: {
        bio: 'Gasfiter disponible para trabajos domiciliarios en la comunidad: instalaciones de gas, detección de fugas y mantención de artefactos.',
        specialties: ['Instalaciones de gas', 'Detección de fugas', 'Mantención de artefactos'],
    },
};

const providers = RAW.map(([rawEmail, rawName, oficio, rawPhone]) => {
    const category = CATEGORY_MAP[oficio];
    const email = rawEmail.split(',')[0].trim();
    return {
        name: titleCase(rawName),
        category,
        contact_phone: normalizePhone(rawPhone),
        email,
        bio: CATEGORY_CONTENT[category].bio,
        specialties: CATEGORY_CONTENT[category].specialties,
        certifications: [],
        rating: 0,
        review_count: 0,
        completed_jobs: 0,
        years_experience: 0,
        availability: 'available',
        response_time: '< 24 horas',
        verified: false,
        community_id: COMMUNITY_ID,
    };
});

// Evitar duplicados por email dentro de la misma comunidad
const emails = providers.map(p => p.email);
const { data: existing, error: existingError } = await supabase
    .from('service_providers')
    .select('email')
    .eq('community_id', COMMUNITY_ID)
    .in('email', emails);

if (existingError) {
    console.error('ERROR consultando existentes:', existingError.message);
    process.exit(1);
}

const existingEmails = new Set((existing || []).map(e => e.email));
const toInsert = providers.filter(p => !existingEmails.has(p.email));

console.log(`En Excel: ${providers.length} | Ya existían: ${existingEmails.size} | A insertar: ${toInsert.length}`);

if (toInsert.length === 0) {
    console.log('Nada que insertar.');
    process.exit(0);
}

const { data, error } = await supabase
    .from('service_providers')
    .insert(toInsert)
    .select('id, name, category, contact_phone');

if (error) {
    console.error('ERROR insertando:', error.message);
    process.exit(1);
}

console.log(`Insertados: ${data.length}`);
for (const p of data) {
    console.log(`${p.name} | ${p.category} | ${p.contact_phone}`);
}
