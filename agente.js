// agente.js - Motor Financiero Anti-Bloqueos
let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Actualizando..." };
let dbLocal = null;

const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", costo: 2.20, precio_usdt: 3.80, precio_euro: 4.00, precio_bcv: 4.50 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", costo: 1.00, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", costo: 0.90, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 }
];

async function iniciar(db) {
  dbLocal = db;
  try {
    const doc = await dbLocal.collection('sistema').doc('tasas_memoria').get();
    if (doc.exists && doc.data().bcv > 0) {
      Object.assign(tasas, doc.data());
    }
  } catch (error) { 
    console.log("No se pudo leer Firebase:", error.message); 
  }
  
  await actualizarTasas();
  setInterval(actualizarTasas, 43200000); // 12 horas
}

// NUEVA ESTRATEGIA: Camuflaje de peticiones para evitar bloqueos
async function obtenerDatosAPI(url) {
  try {
    const respuesta = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Connection': 'keep-alive'
      }
    });
    
    if (!respuesta.ok) throw new Error(`HTTP Error: ${respuesta.status}`);
    
    const texto = await respuesta.text(); // Leemos como texto primero para evitar cuelgues
    
    try {
      return JSON.parse(texto); // Intentamos convertir el texto a formato JSON
    } catch (e) {
      throw new Error("Posible bloqueo de Cloudflare. Respuesta del servidor: " + texto.substring(0, 80));
    }
  } catch (error) {
    console.log(`[Error en API] Falló la conexión a ${url.substring(0, 40)}... Detalle: ${error.message}`);
    return null;
  }
}

async function actualizarTasas() {
  console.log("🔄 Iniciando búsqueda de tasas con camuflaje...");
  let precioBcv = 0, precioBinance = 0, precioEuro = 0;

  // INTENTO 1: PyDolarVenezuela (Suele ser la más exacta)
  const dataPyDolar = await obtenerDatosAPI('https://pydolarvenezuela-api.vercel.app/api/v1/dollar');
  if (dataPyDolar) {
    precioBcv = dataPyDolar.monitors?.bcv?.price || dataPyDolar.bcv?.price || 0;
    precioBinance = dataPyDolar.monitors?.binance?.price || dataPyDolar.binance?.price || 0;
  }

  const dataPyEuro = await obtenerDatosAPI('https://pydolarvenezuela-api.vercel.app/api/v1/euro');
  if (dataPyEuro) {
    precioEuro = dataPyEuro.monitors?.bcv?.price || dataPyEuro.bcv?.price || 0;
  }

  // INTENTO 2: DolarAPI (Respaldo)
  if (precioBcv === 0) {
    console.log("⚠️ PyDolar no respondió o devolvió cero. Intentando con DolarAPI...");
    
    const resBcv = await obtenerDatosAPI('https://ve.dolarapi.com/v1/dolares/oficial');
    if (resBcv) precioBcv = resBcv.promedio || 0;

    const resUsdt = await obtenerDatosAPI('https://ve.dolarapi.com/v1/dolares/binance');
    if (resUsdt) precioBinance = resUsdt.promedio || 0;

    const resEur = await obtenerDatosAPI('https://ve.dolarapi.com/v1/dolares/euro');
    if (resEur) precioEuro = resEur.promedio || 0;
  }

  // VALIDACIÓN Y GUARDADO FINAL
  if (precioBcv > 0 && precioBinance > 0) {
    tasas.bcv = parseFloat(precioBcv);
    tasas.usdt = parseFloat(precioBinance);
    tasas.euro = parseFloat(precioEuro > 0 ? precioEuro : precioBcv * 1.05);
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);

    if (dbLocal) {
      await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
    }
    console.log(`✅ [TASAS REALES OBTENIDAS] BCV: ${tasas.bcv} | USDT: ${tasas.usdt} | EURO: ${tasas.euro}`);
  } else {
    console.log("🚨 ALERTA CRÍTICA: Ninguna API arrojó datos válidos.");
  }
}

async function setTasaManual(moneda, valor) {
  if (moneda === 'BCV') tasas.bcv = parseFloat(valor);
  if (moneda === 'USDT') tasas.usdt = parseFloat(valor);
  if (moneda === 'EURO') tasas.euro = parseFloat(valor);
  tasas.fecha = "Fijada Manualmente";
  
  if (dbLocal) {
    await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
  }
}

module.exports = { tasas, servicios, iniciar, actualizarTasas, setTasaManual };
