const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

async function check() {
    try {
        const res = await fetch(`${url}/rest/v1/polls?select=*&limit=1`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        });

        if (res.ok) {
            const data = await res.json();
            console.log('=> SUCCESS: Polls table exists. Data:', data);
        } else {
            const err = await res.json();
            console.log('=> ERROR: Polls table might not exist.', err);
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

check();
