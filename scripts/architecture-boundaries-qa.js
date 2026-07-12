const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dashboardRoot = path.join(root, 'src', 'app', '(dashboard)');
const apiRoot = path.join(root, 'src', 'app', 'api');
const failures = [];
const checks = [];

function filesUnder(directory, predicate) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(target, predicate) : predicate(target) ? [target] : [];
    });
}

const dashboardFiles = filesUnder(dashboardRoot, file => /\.(ts|tsx)$/.test(file));
const directDatabasePages = dashboardFiles.filter(file => {
    const source = fs.readFileSync(file, 'utf8');
    return /from\s+['"]@\/lib\/supabase(?:['"/])/.test(source)
        || /createClient\s*\(/.test(source);
});

checks.push({
    name: 'Dashboard pages do not instantiate or import Supabase clients',
    passed: directDatabasePages.length === 0,
});
if (directDatabasePages.length) {
    failures.push({
        message: 'Direct database access found in dashboard pages',
        files: directDatabasePages.map(file => path.relative(root, file)),
    });
}

const routeFiles = filesUnder(apiRoot, file => file.endsWith(`${path.sep}route.ts`));
const oversizedRoutes = routeFiles
    .map(file => ({ file, lines: fs.readFileSync(file, 'utf8').split(/\r?\n/).length }))
    .filter(item => item.lines > 1_700);

checks.push({
    name: 'No API route exceeds the current 1700-line ceiling',
    passed: oversizedRoutes.length === 0,
});
if (oversizedRoutes.length) {
    failures.push({
        message: 'Oversized API route found',
        files: oversizedRoutes.map(item => ({ file: path.relative(root, item.file), lines: item.lines })),
    });
}

const agentCenter = path.join(apiRoot, 'agent-center', 'route.ts');
const agentCenterLines = fs.readFileSync(agentCenter, 'utf8').split(/\r?\n/).length;
checks.push({
    name: 'Agent Center domain is extracted from the route',
    passed: fs.existsSync(path.join(root, 'src', 'lib', 'agent-center', 'domain.ts')) && agentCenterLines < 1_650,
    details: { lines: agentCenterLines },
});
if (agentCenterLines >= 1_650) failures.push({ message: 'Agent Center route grew past its refactoring baseline.' });

const report = { passed: failures.length === 0, checks, failures };
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
