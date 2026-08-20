const fs = require("fs");
const path = require("path");

const root = process.cwd();

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce((acc, line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key) acc[key] = value;
      return acc;
    }, {});
}

const localEnv = readEnvFile(path.join(root, ".env.local"));

function env(key) {
  return process.env[key] || localEnv[key] || "";
}

function formatPhoneNumber(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("569")) return `+${digits}`;
  if (digits.startsWith("9") && digits.length === 9) return `+56${digits}`;
  if (digits.startsWith("56")) return `+${digits}`;
  return `+${digits}`;
}

async function main() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
  const to = process.env.TEST_PHONE || localEnv["TEST_PHONE"] || "";

  console.log("=== Diagnostico de WhatsApp (Twilio) ===");

  // Verificar solo que la variable no este vacia no sirve: un placeholder pasa
  // esa prueba y despues Twilio responde 401 sin explicar por que.
  const sidOk = /^AC[0-9a-f]{32}$/i.test(accountSid);
  const tokenOk = /^[0-9a-f]{32}$/i.test(authToken);
  const fromOk = /^whatsapp:\+\d{8,15}$/.test(from);

  console.log(`Account SID: ${!accountSid ? "AUSENTE" : sidOk ? "OK" : "FORMATO INVALIDO (debe ser 'AC' + 32 hex)"}`);
  console.log(`Auth Token:  ${!authToken ? "AUSENTE" : tokenOk ? "OK" : "FORMATO INVALIDO (deben ser 32 caracteres hex)"}`);
  console.log(`From:        ${from} ${fromOk ? "OK" : "<- debe ser 'whatsapp:+56XXXXXXXXX'"}`);

  if (!sidOk || !tokenOk || !fromOk) {
    console.error("\nX Las credenciales no tienen el formato de Twilio.");
    console.error("  Copialas desde https://console.twilio.com (Account Info).");
    console.error("  Mientras sigan asi, ningun envio va a funcionar.");
    process.exit(1);
  }

  if (!to) {
    console.error("\n❌ Error: Debes configurar TEST_PHONE en tu .env.local para realizar el envío.");
    console.log("Ejemplo: TEST_PHONE=+56912345678");
    process.exit(1);
  }
  
  console.log(`To (Test Number): ${to}`);

  if (!accountSid || !authToken) {
    console.error("\n❌ Error: Faltan credenciales en tu .env.local (TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN)");
    process.exit(1);
  }

  const formattedTo = `whatsapp:${formatPhoneNumber(to)}`;
  console.log(`\nEnviando mensaje de prueba a ${formattedTo} ...`);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ 
    From: from, 
    To: formattedTo, 
    Body: "📢 *Diagnóstico ComunidadConnect*\n\n¡Felicidades! La integración de WhatsApp está funcionando correctamente. Tu entorno está listo para producción. ✅" 
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`\n❌ Twilio API Error (${res.status}):`, data.message || data);
      // Los dos rechazos que mas confunden al configurar por primera vez.
      if (String(data.code) === "63016") {
        console.error("\n  Codigo 63016: fuera de la ventana de 24 horas.");
        console.error("  Este script manda texto libre, que WhatsApp solo permite si el");
        console.error("  destinatario te escribio en las ultimas 24 horas. Escribele primero");
        console.error("  desde ese telefono al numero del negocio y vuelve a correrlo.");
      }
      if (String(data.code) === "63007" || String(data.code) === "21910") {
        console.error("\n  El numero de TWILIO_WHATSAPP_FROM no esta registrado como");
        console.error("  remitente de WhatsApp en Twilio (Messaging > Senders).");
      }
      process.exit(1);
    }

    console.log("\n✅ ¡Mensaje de WhatsApp enviado con éxito!");
    console.log("Detalles del mensaje:");
    console.log(`- Message SID: ${data.sid}`);
    console.log(`- Estado:      ${data.status}`);
    console.log(`- Creado:      ${data.date_created}`);
  } catch (error) {
    console.error("\n❌ Error en la conexión de red:", error.message);
    process.exit(1);
  }
}

main();
