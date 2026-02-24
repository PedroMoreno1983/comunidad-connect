
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Faltan variables de entorno');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getUnits() {
    const { data, error } = await supabase.from('units').select('id, number').limit(5);
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('UNITS_DATA:' + JSON.stringify(data));
}

getUnits();
