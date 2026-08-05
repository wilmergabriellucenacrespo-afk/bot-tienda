// agente.js - Motor Financiero Inmune (Conexión vía Google Apps Script - Blindado)
const https = require('https');

let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Actualizando..." };
let dbLocal = null;

// 👇 PEGA AQUÍ TU URL DE GOOGLE ENTRE LAS COMILLAS 👇
const LINK_GOOGLE = 'https://script.google.com/macros/s/AKfycbygubr9rTBpzd8hDQqggb3nIZ5dX8fcLpfepd1FlUGz116O7PugaUvbw1HnzhjKPlu-/exec';

// CATÁLOGO STREAMING • RayoCinemaHD (Costo + $2 de Ganancia Exacta)
const servicios = [
  { id: "netflix", nombre: "🍿 Netflix 4K", duracion: "1 Mes", costo: 4.00, venta: 6.00 },
  { id: "prime", nombre: "🎥 Prime Video", duracion: "1 Mes", costo: 5.00, venta: 7.00 },
  { id: "disney", nombre: "🏰 Disney+ Premium", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "hbo", nombre: "🎞️ HBO Max", duracion: "1 Mes", costo: 2.00, venta: 4.00 },
  { id: "paramount", nombre: "⭐ Paramount+", duracion: "1 Mes", costo: 2.00, venta: 4.00 },
  { id: "vix", nombre: "🎬 Vix Plus", duracion: "1 Mes", costo: 1.00, venta: 3.00 },
  { id: "crunchyroll", nombre: "🌸 Crunchyroll", duracion: "1 Mes", costo: 2.00, venta: 4.00 },
  { id: "appletv", nombre: "⚽ Apple TV+ & MLS", duracion: "1 Mes", costo: 2.00, venta: 4.00 },
  { id: "telelatino", nombre: "📡 Telelatino / Flujo TV", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "viki", nombre: "🇰🇷 Viki / Kocowa", duracion: "1 Mes", costo: 2.00, venta: 4.00 },
  { id: "peacock", nombre: "🦚 Peacock TV 4K", duracion: "1 Mes", costo: 2.00, venta: 4.00 },
  { id: "youtube", nombre: "▶️ YouTube Premium", duracion: "1 Mes", costo: 3.50, venta: 5.50 },
  { id: "tidal", nombre: "🎵 Tidal", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "spotify", nombre: "🌀 Spotify", duracion: "1 Mes", costo: 4.00, venta: 6.00 },
  { id: "applemusic", nombre: "🍎 Apple Music", duracion: "1 Mes", costo: 4.00, venta: 6.00 },
  { id: "capcut", nombre: "🎬 CapCut Pro", duracion: "1 Mes", costo: 6.00, venta: 8.00 },
  { id: "canva", nombre: "🎨 Canva Pro", duracion: "1 Mes", costo: 2.00, venta: 4.00 },
  { id: "adobe", nombre: "🖌️ Adobe Creative Cloud", duracion: "1 Mes", costo: 6.00, venta: 8.00 },
  { id: "supergrok", nombre: "🤖 SuperGrok", duracion: "1 Mes", costo: 10.00, venta: 12.00 },
  { id: "coursera", nombre: "🎓 Coursera Premium", duracion: "1 Mes", costo: 5.00, venta: 7.00 },
  { id: "nordvpn", nombre: "🛡️ NordVPN", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "protonvpn", nombre: "🌐 ProtonVPN", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "expressvpn", nombre: "🚀 ExpressVPN", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "hma", nombre: "🕵️ HMA! Pro VPN", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "bitdefender", nombre: "🔐 Bitdefender VPN", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "googleone_1y", nombre: "☁️ Google One 5TB+Gemini", duracion: "1 Año", costo: 10.00, venta: 12.00 },
  { id: "googleone_1m", nombre: "☁️ Google One 5TB+Gemini", duracion: "1 Mes", costo: 3.00, venta: 5.00 },
  { id: "office", nombre: "💻 Microsoft Office", duracion: "1 Año", costo: 7.00, venta: 9.00 },
  { id: "windows", nombre: "🪟 Licencia Windows", duracion: "1 Año", costo: 10.00, venta: 12.00 },
  { id: "icloud", nombre: "☁️ Almacenamiento iCloud", duracion: "1 Mes", costo: 10.00, venta: 12.00 },
  { id: "numeros", nombre: "📲 Números WhatsApp/Tel.", duracion: "Único", costo: 2.00, venta: 4.00 },
  { id: "humanatic", nombre: "💼 Cuentas Humanatic", duracion: "Único", costo: 5.00, venta: 7.00 }
];

function pedirAGoogle(url) {
  return new Promise((resolve) => {
    console.log("🌐 Intentando conectar con Google...");
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (resRedir) => {
          let data = '';
          resRedir.on('data', (chunk) => data += chunk);
          resRedir.on('end', () => {
            try { resolve(JSON.parse(data)); } 
            catch (e) { console.log("❌ GOOGLE RESPONDIÓ CON ERROR."); resolve(null); }
          });
        }).on('error', (err) => resolve(null));
      } else {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } 
          catch (e) { console.log("❌ GOOGLE RESPONDIÓ SIN REDIRECCIÓN Y CON ERROR."); resolve(null); }
        });
      }
    }).on('error', (err) => resolve(null));
  });
}

async function iniciar(db) {
  dbLocal = db;
  try {
    const doc = await dbLocal.collection('sistema').doc('tasas_memoria').get();
    if (doc.exists && doc.data().bcv > 0) Object.assign(tasas, doc.data());
  } catch (error) { console.log("Firebase no leído:", error.message); }
  
  await actualizarTasas();
  setInterval(actualizarTasas, 43200000);
}

async function actualizarTasas() {
  const datos = await pedirAGoogle(LINK_GOOGLE);
  if (datos && datos.bcv > 0 && datos.binance > 0) {
    tasas.bcv = parseFloat(datos.bcv);
    tasas.usdt = parseFloat(datos.binance);
    tasas.euro = parseFloat(datos.euro > 0 ? datos.euro : datos.bcv * 1.05);
    
    tasas.fecha = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' });
    if (dbLocal) await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
  }
}

async function setTasaManual(moneda, valor) {
  if (moneda === 'BCV') tasas.bcv = parseFloat(valor);
  if (moneda === 'USDT') tasas.usdt = parseFloat(valor);
  if (moneda === 'EURO') tasas.euro = parseFloat(valor);
  tasas.fecha = "Fijada Manualmente";
  if (dbLocal) await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
}

module.exports = { tasas, servicios, iniciar, actualizarTasas, setTasaManual };
