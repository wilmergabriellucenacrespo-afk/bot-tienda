// agente.js - Motor Financiero Real (Sin recortes)
let tasas = { usdt: 41.50, euro: 44.00, bcv: 36.60, fecha: "Actualizando..." };
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
    console.log("No se pudo leer la memoria en Firebase."); 
  }
  
  await actualizarTasas();
  setInterval(actualizarTasas, 43200000); // Se actualiza cada 12 horas
}

async function actualizarTasas() {
  try {
    const opcionesHeader = { 'Accept': 'application/json' };
    
    // Llamadas directas y limpias a la API para no obtener ceros
    const reqBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { headers: opcionesHeader });
    const dataBcv = await reqBcv.json();

    const reqUsdt = await fetch('https://ve.dolarapi.com/v1/dolares/binance', { headers: opcionesHeader });
    const dataUsdt = await reqUsdt.json();

    const reqEur = await fetch('https://ve.dolarapi.com/v1/dolares/euro', { headers: opcionesHeader });
    const dataEur = await reqEur.json();

    // Validamos que la API realmente entregue números mayores a cero
    if (dataBcv.promedio > 0 && dataUsdt.promedio > 0) {
      tasas.bcv = dataBcv.promedio;
      tasas.usdt = dataUsdt.promedio;
      tasas.euro = dataEur.promedio;
      
      const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
      tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);

      // Guardamos la tasa real en Firebase para que el bot nunca arranque vacío
      if (dbLocal) {
        await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
      }
      console.log(`[TASAS REALES] BCV: ${tasas.bcv} | USDT: ${tasas.usdt} | EURO: ${tasas.euro}`);
    }
  } catch (error) {
    console.log("Fallo de conexión a la API. Se mantiene la última tasa real.");
  }
}

async function setTasaManual(moneda, valor) {
  if (moneda === 'BCV') tasas.bcv = valor;
  if (moneda === 'USDT') tasas.usdt = valor;
  if (moneda === 'EURO') tasas.euro = valor;
  tasas.fecha = "Fijada Manualmente";
  
  if (dbLocal) {
    await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
  }
}

module.exports = { tasas, servicios, iniciar, actualizarTasas, setTasaManual };
