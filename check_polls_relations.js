const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

async function check() {
    try {
        const res = await fetch(`${url}/rest/v1/polls?select=*,options:poll_options(*),votes:votes(option_id)&status=eq.active`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        });

        if (res.ok) {
            const data = await res.json();
            console.log('SUCCESS:', JSON.stringify(data, null, 2));
        } else {
            const err = await res.json();
            console.log('API ERROR:', JSON.stringify(err, null, 2));
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

check();
