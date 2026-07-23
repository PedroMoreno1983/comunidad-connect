const crypto = require('crypto');
const { loadEnvFile } = require('./load-env');
const { createClient } = require('@supabase/supabase-js');

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const report = {
  generatedAt: new Date().toISOString(),
  passed: false,
  checks: [],
  failures: [],
};

function assert(condition, message, details = {}) {
  if (!condition) {
    report.failures.push({ message, details });
    throw new Error(message);
  }
  report.checks.push({ message, details });
}

function requiredEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) throw new Error(`Missing env for marketplace messaging QA: ${missing.join(', ')}`);
}

async function signInAs(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return client;
}

async function main() {
  requiredEnv();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = crypto.randomUUID().slice(0, 8);
  const password = `Marketplace-QA-${runId}!2026`;
  const communityA = crypto.randomUUID();
  const communityB = crypto.randomUUID();
  const users = [
    { email: `seller-${runId}@qa.convive.local`, name: 'QA Seller', communityId: communityA },
    { email: `buyer-${runId}@qa.convive.local`, name: 'QA Buyer', communityId: communityA },
    { email: `outsider-${runId}@qa.convive.local`, name: 'QA Outsider', communityId: communityB },
  ];
  const cleanup = { userIds: [], communityIds: [communityA, communityB] };

  try {
    const { error: schemaError } = await admin.from('marketplace_conversations').select('id').limit(1);
    if (schemaError) throw new Error(`Marketplace messaging schema is not ready: ${schemaError.message}`);
    assert(true, 'Marketplace messaging tables are available');

    const { data: createdCommunities, error: communitiesError } = await admin.from('communities').insert([
      { id: communityA, name: `QA Marketplace A ${runId}`, subscription_status: 'active' },
      { id: communityB, name: `QA Marketplace B ${runId}`, subscription_status: 'active' },
    ]).select('id,admin_code');
    if (communitiesError) throw communitiesError;
    const inviteCodeByCommunity = new Map(createdCommunities.map(community => [community.id, community.admin_code]));
    assert(true, 'Temporary communities created');

    for (const candidate of users) {
      const { data, error } = await admin.auth.admin.createUser({
        email: candidate.email,
        password,
        email_confirm: true,
        user_metadata: {
          name: candidate.name,
          invite_code: inviteCodeByCommunity.get(candidate.communityId),
        },
      });
      if (error || !data.user) throw error || new Error(`Could not create ${candidate.email}`);
      candidate.id = data.user.id;
      cleanup.userIds.push(data.user.id);

      const { error: profileError } = await admin.from('profiles').upsert({
        id: data.user.id,
        name: candidate.name,
        email: candidate.email,
        role: 'resident',
        community_id: candidate.communityId,
      }, { onConflict: 'id' });
      if (profileError) throw profileError;
    }
    assert(true, 'Seller, buyer and outsider profiles created');

    const [seller, buyer, outsider] = users;
    const { data: item, error: itemError } = await admin.from('marketplace_items').insert({
      title: `QA Marketplace item ${runId}`,
      description: 'Private messaging sentinel item',
      price: 1000,
      category: 'other',
      status: 'available',
      seller_id: seller.id,
      community_id: communityA,
    }).select('id').single();
    if (itemError || !item) throw itemError || new Error('Could not create marketplace item');
    assert(true, 'Marketplace sentinel item created');

    const sellerClient = await signInAs(seller.email, password);
    const buyerClient = await signInAs(buyer.email, password);
    const outsiderClient = await signInAs(outsider.email, password);

    const { data: conversationId, error: startError } = await buyerClient.rpc('start_marketplace_conversation', {
      p_item_id: item.id,
    });
    if (startError || !conversationId) throw startError || new Error('Buyer could not start conversation');
    assert(true, 'Buyer can start a conversation for an item in their community');

    const { error: buyerMessageError } = await buyerClient.from('marketplace_conversation_messages').insert({
      conversation_id: conversationId,
      sender_id: buyer.id,
      content: 'Hola, ¿sigue disponible?',
    });
    if (buyerMessageError) throw buyerMessageError;
    assert(true, 'Buyer can send a persisted message');

    const { data: sellerMessages, error: sellerReadError } = await sellerClient
      .from('marketplace_conversation_messages')
      .select('id,content,sender_id')
      .eq('conversation_id', conversationId);
    if (sellerReadError) throw sellerReadError;
    assert(
      sellerMessages.length === 1 && sellerMessages[0].sender_id === buyer.id,
      'Seller can read the buyer message',
    );

    const { data: outsiderMessages, error: outsiderReadError } = await outsiderClient
      .from('marketplace_conversation_messages')
      .select('id')
      .eq('conversation_id', conversationId);
    if (outsiderReadError) throw outsiderReadError;
    assert(outsiderMessages.length === 0, 'Another community cannot read the conversation');

    const { error: crossTenantStartError } = await outsiderClient.rpc('start_marketplace_conversation', {
      p_item_id: item.id,
    });
    assert(Boolean(crossTenantStartError), 'Another community cannot start a conversation for the item');

    const { error: spoofedSenderError } = await buyerClient.from('marketplace_conversation_messages').insert({
      conversation_id: conversationId,
      sender_id: seller.id,
      content: 'Forged seller message',
    });
    assert(Boolean(spoofedSenderError), 'Buyer cannot forge the seller identity');

    const { error: sellerReplyError } = await sellerClient.from('marketplace_conversation_messages').insert({
      conversation_id: conversationId,
      sender_id: seller.id,
      content: 'Sí, coordinemos la entrega por este chat.',
    });
    if (sellerReplyError) throw sellerReplyError;
    assert(true, 'Seller can reply in the same persisted conversation');

    const { data: buyerInbox, error: inboxError } = await buyerClient.rpc('get_marketplace_inbox');
    if (inboxError) throw inboxError;
    const inboxConversation = buyerInbox.find(row => row.conversation_id === conversationId);
    assert(
      inboxConversation && Number(inboxConversation.unread_count) === 1,
      'Buyer inbox reports the unread seller reply',
    );

    const { error: markReadError } = await buyerClient.rpc('mark_marketplace_conversation_read', {
      p_conversation_id: conversationId,
    });
    if (markReadError) throw markReadError;

    const { data: refreshedInbox, error: refreshedInboxError } = await buyerClient.rpc('get_marketplace_inbox');
    if (refreshedInboxError) throw refreshedInboxError;
    const refreshedConversation = refreshedInbox.find(row => row.conversation_id === conversationId);
    assert(
      refreshedConversation && Number(refreshedConversation.unread_count) === 0,
      'Reading a conversation clears its unread count',
    );

    report.passed = true;
  } finally {
    for (const userId of cleanup.userIds) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // Best-effort cleanup.
      }
    }
    try {
      await admin.from('communities').delete().in('id', cleanup.communityIds);
    } catch {
      // Best-effort cleanup.
    }
  }
}

main()
  .then(() => console.log(JSON.stringify(report, null, 2)))
  .catch(error => {
    report.failures.push({ message: error.message });
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  });
