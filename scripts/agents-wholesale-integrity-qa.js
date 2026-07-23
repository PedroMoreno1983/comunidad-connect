const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const failures = [];
const checks = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (label, condition) => { checks.push(label); if (!condition) failures.push(label); };

const prompt = read('src/lib/coco/system-prompt.ts');
const navigation = read('src/lib/coco/navigation.ts');
const tools = read('src/lib/coco/tools.ts');
const cocoAgent = read('src/lib/coco/agent.ts');
const groupRoute = read('src/app/api/supermarket/group-orders/route.ts');
const groupDomain = read('src/lib/supermarketGroupOrders.ts');
const groupUi = read('src/components/resident/supermarket/GroupBuyPanel.tsx');
const migration = read('supabase/migrations/20260723120000_supermarket_group_wholesale.sql');
const selectedBasketMigration = read('supabase/migrations/20260723143000_supermarket_group_selected_basket.sql');
const superadmin = read('src/app/api/superadmin/communities/route.ts');

expect('CoCo exposes the supermarket route', navigation.includes('"/resident/supermercado": "Supermercado"') && !navigation.includes('new Set(["/resident/supermercado"'));
expect('CoCo states the external purchase boundary', prompt.includes('Nunca digas que Convive realizo la compra'));
expect('Group mutations require CoCo confirmation', ['create_supermarket_group_order', 'join_supermarket_group_order', 'lock_supermarket_group_order'].every(name => tools.includes(`'${name}'`)));
expect('Group route authenticates a stored profile', groupRoute.includes('getAuthenticatedAgentProfile'));
expect('CoCo forces group purchase commands through mutating tools', ['create_supermarket_group_order', 'join_supermarket_group_order', 'lock_supermarket_group_order'].every(name => cocoAgent.includes(`return '${name}'`)));
expect('Group reads and writes are rate limited', groupRoute.includes('supermarket.group.read') && groupRoute.includes('supermarket.group.write'));
expect('Group writes emit operation audit events', groupRoute.includes('recordOperationEvent') && groupRoute.includes('supermarket.group.${action}'));
expect('Group domain scopes every order to the profile community', groupDomain.includes(".eq('community_id', communityId)"));
expect('Group contributions identify the real user', groupDomain.includes('user_id: userId'));
expect('Only organizer or admin can lock an order', groupDomain.includes("profile.role !== 'admin'"));
expect('Wholesale comparison aggregates requested quantities', groupDomain.includes('quantities[term] = (quantities[term] || 0)'));
expect('Prepared group orders remain visible after they are locked', groupUi.includes('visibleOrders') && groupUi.includes("order.status === 'locked'"));
expect('The exact selected basket is persisted when an order is locked', selectedBasketMigration.includes('selected_items JSONB') && groupDomain.includes('selected_items: selected.items'));
expect('Prepared group orders expose persisted direct product links', groupUi.includes('order.selectedItems') && groupUi.includes('Productos listos para abrir') && groupUi.includes('item.productUrl'));
expect('RLS isolates orders, members and items by community', ['supermarket_group_orders_read_community', 'supermarket_group_members_read_community', 'supermarket_group_items_read_community'].every(policy => migration.includes(policy)));
expect('Platform audit is inaccessible to normal authenticated users', migration.includes('REVOKE ALL ON public.platform_operation_events FROM anon, authenticated'));
expect('SuperAdmin lead changes are globally audited', superadmin.includes('superadmin.commercial_lead_status_changed'));

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), passed: failures.length === 0, checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
