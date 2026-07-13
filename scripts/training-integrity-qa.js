const fs = require('fs');
const path = require('path');
const root = process.cwd();
const failures = [];
const checks = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (label, condition) => { checks.push(label); if (!condition) failures.push(label); };

const modulesRoute = read('src/app/api/training/modules/route.ts');
const progressRoute = read('src/app/api/training/progress/route.ts');
const residentPage = read('src/app/(dashboard)/resident/training/page.tsx');
const classroom = read('src/components/training/MultiAgentClassroom.tsx');
const migration = read('supabase/migrations/043_training_multitenant_progress.sql');

expect('Course API resolves authenticated profile', modulesRoute.includes('getAuthenticatedAgentProfile'));
expect('Course reads are scoped to profile community', modulesRoute.includes('community_id.is.null,community_id.eq.${profile.community_id}'));
expect('Course writes require admin role', modulesRoute.includes("profile.role !== 'admin'"));
expect('Official global courses cannot be deleted', modulesRoute.includes('Los cursos oficiales no se pueden eliminar'));
expect('Progress API derives user and community server-side', progressRoute.includes('profile.id') && progressRoute.includes('profile.community_id'));
expect('Progress target course is checked against community', progressRoute.includes('Curso no disponible para tu comunidad'));
expect('Resident page loads and writes persisted progress', residentPage.includes('/api/training/progress') && residentPage.includes('saveProgress'));
expect('Classroom exposes explicit completion action', classroom.includes('onComplete') && classroom.includes('Completar curso'));
expect('Training modules have tenant RLS', migration.includes('training_modules_admin_delete') && migration.includes('current_profile_community_id'));
expect('Training progress has own-user RLS', migration.includes('user_training_progress_read_own') && migration.includes('user_id = auth.uid()'));

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), passed: failures.length === 0, checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
