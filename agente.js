// agente.js - Motor Financiero Real (Corregido y Optimizado)
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
    console.log("No se pudo leer la memoria en Firebase. Error:", error.message); 
  }
  
  await actualizarTasas();
  setInterval(actualizarTasas, 43200000); // Se actualiza cada 12 horas
}

async function actualizarTasas() {
  try {
    // Usamos la API PyDolarVenezuela (la más estable actualmente para VE)
    const reqDolar = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar/monitors');
    const dataDolar = await reqDolar.json();

    const reqEuro = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro/monitors');
    const dataEuro = await reqEuro.json();

    // Extraemos los precios directamente (la API usa 'price' en lugar de 'promedio')
    const precioBcv = dataDolar.bcv?.price;
    const precioBinance = dataDolar.binance?.price;
    const precioEuro = dataEuro.bcv?.price; // Tasa oficial del euro en BCV

    // Validamos que la API entregue números mayores a cero
    if (precioBcv > 0 && precioBinance > 0) {
      tasas.bcv = precioBcv;
      tasas.usdt = precioBinance;
      tasas.euro = precioEuro || tasas.euro; // Fallback de seguridad
      
      const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
      tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);

      // Guardamos la tasa real en Firebase
      if (dbLocal) {
        await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
      }
      console.log(`[TASAS REALES] BCV: ${tasas.bcv} | USDT: ${tasas.usdt} | EURO: ${tasas.euro}`);
    } else {
      console.log("La API devolvió valores inválidos. Se mantiene la última tasa de memoria.");
    }
  } catch (error) {
    // AHORA imprimimos el error. Si fetch no existe o la red cae, lo sabrás de inmediato.
    console.log("Fallo de conexión a la API. Error real:", error.message);
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
