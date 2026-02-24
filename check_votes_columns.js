const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

async function getColumns() {
    try {
        const res = await fetch(`${url}/rest/v1/?apikey=${key}`);
        const swagger = await res.json();
        console.log("Columns of votes:", Object.keys(swagger.definitions.votes.properties));
    } catch (err) {
        console.error(err);
    }
}

getColumns();
