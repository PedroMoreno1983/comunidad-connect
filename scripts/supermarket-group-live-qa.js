const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const report = { generatedAt: new Date().toISOString(), passed: false, checks: [], failures: [] };

function assert(condition, message, details = {}) {
    if (!condition) throw Object.assign(new Error(message), { details });
    report.checks.push({ message, details });
}

async function main() {
    if (!url || !anonKey || !serviceKey) throw new Error('Faltan credenciales Supabase para QA.');
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const runId = crypto.randomUUID().slice(0, 8);
    const cleanup = { userIds: [], communityIds: [], orderIds: [] };

    try {
        const tableCheck = await admin.from('supermarket_group_orders').select('id,selected_items').limit(1);
        assert(!tableCheck.error, 'Group purchase tables are available', { error: tableCheck.error?.message });

        const communities = [
            { id: crypto.randomUUID(), name: `Group QA A ${runId}`, subscription_status: 'active' },
            { id: crypto.randomUUID(), name: `Group QA B ${runId}`, subscription_status: 'active' },
        ];
        cleanup.communityIds.push(...communities.map(item => item.id));
        const { data: createdCommunities, error: communityError } = await admin
            .from('communities')
            .insert(communities)
            .select('id,resident_code');
        if (communityError || createdCommunities?.length !== 2) throw communityError || new Error('No se crearon comunidades QA.');

        const password = `Group-${runId}!2026`;
        const definitions = [
            { email: `group-a1-${runId}@qa.convive.local`, community: createdCommunities[0] },
            { email: `group-a2-${runId}@qa.convive.local`, community: createdCommunities[0] },
            { email: `group-b-${runId}@qa.convive.local`, community: createdCommunities[1] },
        ];
        const users = [];
        for (const definition of definitions) {
            const created = await admin.auth.admin.createUser({
                email: definition.email,
                password,
                email_confirm: true,
                user_metadata: { name: definition.email.split('@')[0], invite_code: definition.community.resident_code },
            });
            if (created.error || !created.data.user) throw created.error || new Error('No se creo usuario QA.');
            cleanup.userIds.push(created.data.user.id);
            const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
            const signedIn = await client.auth.signInWithPassword({ email: definition.email, password });
            if (signedIn.error) throw signedIn.error;
            users.push({ id: created.data.user.id, client });
        }

        const orderId = crypto.randomUUID();
        cleanup.orderIds.push(orderId);
        const createOrder = await users[0].client.from('supermarket_group_orders').insert({
            id: orderId,
            community_id: createdCommunities[0].id,
            created_by: users[0].id,
            title: `Compra QA ${runId}`,
            closes_at: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        });
        if (createOrder.error) throw createOrder.error;
        assert(true, 'Resident can create an order only as themselves in their community');

        const memberOne = await users[0].client.from('supermarket_group_order_members').insert({
            order_id: orderId,
            community_id: createdCommunities[0].id,
            user_id: users[0].id,
        });
        const itemOne = await users[0].client.from('supermarket_group_order_items').insert({
            order_id: orderId,
            community_id: createdCommunities[0].id,
            user_id: users[0].id,
            requested_term: 'arroz',
            quantity: 2,
        });
        if (memberOne.error || itemOne.error) throw memberOne.error || itemOne.error;

        const outsiderRead = await users[2].client
            .from('supermarket_group_orders')
            .select('id')
            .eq('id', orderId);
        assert(!outsiderRead.error && outsiderRead.data.length === 0, 'Another community cannot read the order');

        const forgedMember = await users[2].client.from('supermarket_group_order_members').insert({
            order_id: orderId,
            community_id: createdCommunities[0].id,
            user_id: users[2].id,
        });
        assert(Boolean(forgedMember.error), 'Another community cannot join the order');

        const memberTwo = await users[1].client.from('supermarket_group_order_members').insert({
            order_id: orderId,
            community_id: createdCommunities[0].id,
            user_id: users[1].id,
        });
        const itemTwo = await users[1].client.from('supermarket_group_order_items').insert({
            order_id: orderId,
            community_id: createdCommunities[0].id,
            user_id: users[1].id,
            requested_term: 'arroz',
            quantity: 4,
        });
        if (memberTwo.error || itemTwo.error) throw memberTwo.error || itemTwo.error;

        const [members, items] = await Promise.all([
            users[0].client.from('supermarket_group_order_members').select('user_id').eq('order_id', orderId),
            users[0].client.from('supermarket_group_order_items').select('user_id,requested_term,quantity').eq('order_id', orderId),
        ]);
        assert(
            !members.error && members.data.length === 2 && !items.error && items.data.reduce((sum, item) => sum + item.quantity, 0) === 6,
            'Real members and their quantities persist separately',
            { members: members.data?.length, quantity: items.data?.reduce((sum, item) => sum + item.quantity, 0) },
        );

        const unauthorizedLock = await users[1].client
            .from('supermarket_group_orders')
            .update({ status: 'locked' })
            .eq('id', orderId)
            .select('id');
        assert(
            Boolean(unauthorizedLock.error) || unauthorizedLock.data.length === 0,
            'A non-organizer resident cannot lock the group order',
        );

        const selectedItems = [{
            requestedTerm: 'arroz',
            requestedQuantity: 6,
            name: 'Arroz Grado 2 aCuenta 1kg',
            store: 'aCuenta',
            price: 850,
            quantity: 6,
            packUnits: 1,
            suppliedQuantity: 6,
            lineTotal: 5100,
            productUrl: 'https://www.acuenta.cl/product/arroz-grado-2-acuenta-1kg',
        }];
        const organizerLock = await users[0].client
            .from('supermarket_group_orders')
            .update({
                status: 'locked',
                selected_store: 'aCuenta',
                selected_total: 5100,
                selected_channel_type: 'wholesale',
                retailer_url: 'https://www.acuenta.cl',
                selected_items: selectedItems,
            })
            .eq('id', orderId)
            .select('status,selected_items')
            .single();
        assert(
            !organizerLock.error
                && organizerLock.data?.status === 'locked'
                && organizerLock.data?.selected_items?.[0]?.productUrl === selectedItems[0].productUrl
                && organizerLock.data?.selected_items?.[0]?.requestedQuantity === 6,
            'Organizer can lock and recover the exact selected basket with direct links',
            { error: organizerLock.error?.message, selectedItems: organizerLock.data?.selected_items?.length },
        );

        const platformAuditRead = await users[0].client.from('platform_operation_events').select('id').limit(1);
        assert(Boolean(platformAuditRead.error), 'Platform audit is not readable by community users');
        report.passed = true;
    } finally {
        for (const orderId of cleanup.orderIds) {
            await admin.from('supermarket_group_orders').delete().eq('id', orderId);
        }
        for (const userId of cleanup.userIds) {
            await admin.auth.admin.deleteUser(userId).catch(() => undefined);
        }
        if (cleanup.communityIds.length) {
            await admin.from('communities').delete().in('id', cleanup.communityIds);
        }
    }
}

main()
    .then(() => console.log(JSON.stringify(report, null, 2)))
    .catch(error => {
        report.failures.push({ message: error.message, details: error.details || {} });
        console.error(JSON.stringify(report, null, 2));
        process.exit(1);
    });
