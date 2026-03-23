const url = 'https://sxtnhhblunvorbwbmmbg.supabase.co/rest/v1/training_modules?select=*&limit=1';
const headers = {
    'apikey': '***REMOVED***',
    'Authorization': 'Bearer ***REMOVED***'
};

fetch(url, { headers })
    .then(r => r.json())
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(console.error);
