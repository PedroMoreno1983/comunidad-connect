// Script para simular un webhook desde AWS IoT o un sensor Tuya/Shelly.
const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/iot';
const WEBHOOK_SECRET = process.env.IOT_WEBHOOK_SECRET || 'dev-iot-secret-123';

async function testIoTWebhook() {
  console.log('Enviando evento simulado de Shelly Flood...');

  const startTime = Date.now();

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEBHOOK_SECRET}`
      },
      body: JSON.stringify({
        sensor_id: 'SH-FLOOD-001',
        type: 'WATER_LEAK',
        unit_id: '11111111-1111-1111-1111-111111111111',
        community_id: '00000000-0000-0000-0000-000000000000',
        severity: 'CRITICAL',
        location_detail: 'Baño Principal - Debajo del lavabo'
      })
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`\nTiempo de respuesta del servidor: ${duration}ms`);
    console.log(`Status Code: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
        const data = await response.json();
        console.log('Respuesta JSON:', data);
        if (duration < 1000) {
            console.log('✅ Éxito: El servidor respondió casi de inmediato (asíncrono). El agente está procesando en background.');
        } else {
            console.log('⚠️ Advertencia: El servidor tardó más de 1 segundo. Es posible que no sea asíncrono.');
        }
    } else {
        const err = await response.text();
        console.log('Error Respuesta:', err);
    }
  } catch (err) {
    console.error('Error de conexión:', err);
  }
}

testIoTWebhook();
