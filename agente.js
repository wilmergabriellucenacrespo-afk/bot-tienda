// agente.js - Motor Financiero (Con Sistema Anti-Bloqueos Proxy)
const https = require('https');

let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Actualizando..." };
let dbLocal = null;

const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", costo: 2.20, precio_usdt: 3.80, precio_euro: 4.00, precio_bcv: 4.50 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", costo: 1.00, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", costo: 0.90, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 }
];

// Función para hacer la petición HTTPS
function hacerGet(url) {
  return new Promise((resolve) => {
    const opciones = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    };
    https.get(url, opciones, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Función que intenta la conexión directa y luego usa Proxies para evadir a Cloudflare
async function peticionAPI(urlBase) {
  // Intentamos primero con un Proxy gratuito para ocultar la IP de Render
  const urlProxy = `https://api.codetabs.com/v1/proxy?quest=${urlBase}`;
  
  let resultado = await hacerGet(urlProxy);
  if (resultado) return resultado;

  // Si el proxy falla, intentamos la conexión directa
  resultado = await hacerGet(urlBase);
  return resultado;
}

async function iniciar(db) {
  dbLocal = db;
  try {
    const doc = await dbLocal.collection('sistema').doc('tasas_memoria').get();
    if (doc.exists && doc.data().bcv > 0) {
      Object.assign(tasas, doc.data());
    }
  } catch (error) { 
    console.log("Firebase no leído:", error.message); 
  }
  
  await actualizarTasas();
  setInterval(actualizarTasas, 43200000); // 12 horas
}

async function actualizarTasas() {
  console.log("🔄 Buscando tasas usando Servidores Proxy...");
  let precioBcv = 0, precioBinance = 0, precioEuro = 0;

  // INTENTO 1: PyDolar
  const dataPy = await peticionAPI('https://pydolarvenezuela-api.vercel.app/api/v1/dollar');
  if (dataPy) {
    precioBcv = dataPy.monitors?.bcv?.price || dataPy.bcv?.price || 0;
    precioBinance = dataPy.monitors?.binance?.price || dataPy.binance?.price || 0;
  }
  const dataPyEur = await peticionAPI('https://pydolarvenezuela-api.vercel.app/api/v1/euro');
  if (dataPyEur) {
    precioEuro = dataPyEur.monitors?.bcv?.price || dataPyEur.bcv?.price || 0;
  }

  // INTENTO 2: DolarAPI
  if (precioBcv === 0) {
    console.log("⚠️ Proxy con PyDolar falló. Intentando Proxy con DolarAPI...");
    const resBcv = await peticionAPI('https://ve.dolarapi.com/v1/dolares/oficial');
    if (resBcv) precioBcv = resBcv.promedio || 0;

    const resUsdt = await peticionAPI('https://ve.dolarapi.com/v1/dolares/binance');
    if (resUsdt) precioBinance = resUsdt.promedio || 0;

    const resEur = await peticionAPI('https://ve.dolarapi.com/v1/dolares/euro');
    if (resEur) precioEuro = resEur.promedio || 0;
  }

  // GUARDADO
  if (precioBcv > 0 && precioBinance > 0) {
    tasas.bcv = parseFloat(precioBcv);
    tasas.usdt = parseFloat(precioBinance);
    tasas.euro = parseFloat(precioEuro > 0 ? precioEuro : precioBcv * 1.05);
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);

    if (dbLocal) await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
    console.log(`✅ [TASAS ACTUALIZADAS] BCV: ${tasas.bcv} | USDT: ${tasas.usdt} | EURO: ${tasas.euro}`);
  } else {
    console.log("🚨 ALERTA: Render y el Proxy están bloqueados. Usa los comandos manuales en Telegram.");
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
