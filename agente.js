// agente.js - Motor Financiero Real (Blindado con doble API)
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

async function actualizarTasas() {
  let precioBcv = 0, precioBinance = 0, precioEuro = 0;

  console.log("🔄 Buscando tasas reales en el mercado...");

  try {
    // INTENTO 1: Usando PyDolarVenezuela
    const req = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar');
    const data = await req.json();

    // La API a veces agrupa en "monitors", revisamos ambas posibilidades
    precioBcv = data.monitors?.bcv?.price || data.bcv?.price || 0;
    precioBinance = data.monitors?.binance?.price || data.binance?.price || 0;
    
    const reqEuro = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro');
    const dataEuro = await reqEuro.json();
    precioEuro = dataEuro.monitors?.bcv?.price || dataEuro.bcv?.price || 0;

  } catch (error1) {
    console.log("⚠️ Falló la API PyDolar. Intentando con DolarAPI (Error: " + error1.message + ")");
  }

  // INTENTO 2: Si la primera falló o devolvió 0, usamos DolarAPI
  if (precioBcv === 0) {
    try {
      const opcionesHeader = { 'Accept': 'application/json' };
      
      const reqBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { headers: opcionesHeader });
      precioBcv = (await reqBcv.json()).promedio || 0;

      const reqUsdt = await fetch('https://ve.dolarapi.com/v1/dolares/binance', { headers: opcionesHeader });
      precioBinance = (await reqUsdt.json()).promedio || 0;

      const reqEur = await fetch('https://ve.dolarapi.com/v1/dolares/euro', { headers: opcionesHeader });
      precioEuro = (await reqEur.json()).promedio || 0;
    } catch (error2) {
      console.log("❌ Falló DolarAPI. (Error: " + error2.message + ")");
    }
  }

  // VALIDACIÓN FINAL Y GUARDADO
  if (precioBcv > 0 && precioBinance > 0) {
    tasas.bcv = parseFloat(precioBcv);
    tasas.usdt = parseFloat(precioBinance);
    tasas.euro = parseFloat(precioEuro > 0 ? precioEuro : precioBcv * 1.05); // Respaldo para el euro
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);

    if (dbLocal) {
      await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
    }
    console.log(`✅ [TASAS REALES ACTUALIZADAS] BCV: ${tasas.bcv} | USDT: ${tasas.usdt} | EURO: ${tasas.euro}`);
  } else {
    console.log("🚨 ALERTA: Ninguna API devolvió datos válidos. El bot está usando la última tasa guardada en Firebase.");
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
