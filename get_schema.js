const url = 'https://sxtnhhblunvorbwbmmbg.supabase.co/rest/v1/training_modules?select=*&limit=1';
const headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dG5oaGJsdW52b3Jid2JtbWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NjMwMzksImV4cCI6MjA4NjIzOTAzOX0.xEWXRzeCXEjbilVPM_BmFsd5QUlGyNXcwRDIkbzuJY8',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dG5oaGJsdW52b3Jid2JtbWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NjMwMzksImV4cCI6MjA4NjIzOTAzOX0.xEWXRzeCXEjbilVPM_BmFsd5QUlGyNXcwRDIkbzuJY8'
};

fetch(url, { headers })
    .then(r => r.json())
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(console.error);
