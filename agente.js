// agente.js - Motor Financiero Reparado (Referencias fijas y Anti-Caídas)
const tasas = { usdt: 41.50, euro: 44.00, bcv: 36.60, fecha: "Iniciando sistema..." };
let dbLocal;

const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", costo: 2.20, precio_usdt: 3.80, precio_euro: 4.00, precio_bcv: 4.50 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", costo: 1.00, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", costo: 0.90, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 }
];

async function iniciar(db) {
  dbLocal = db;
  
  // ESCUDO 1: Recuperar memoria sin romper la referencia (Object.assign)
  try {
    const doc = await dbLocal.collection('sistema').doc('tasas_memoria').get();
    if (doc.exists && doc.data().bcv > 0) {
      Object.assign(tasas, doc.data());
      console.log("[Memoria] Tasas recuperadas de Firebase.");
    }
  } catch (error) { 
    console.log("[Alerta] No se pudo leer Firebase en el arranque."); 
  }
  
  await actualizarTasas();
  setInterval(actualizarTasas, 43200000); // Cada 12 horas
}

async function actualizarTasas() {
  try {
    const res = await fetch('https://api.allorigins.win/raw?url=https://ve.dolarapi.com/v1/dolares');
    const data = await res.json();
    
    const oficial = data.find(d => d.casa === 'oficial')?.promedio;
    const binance = data.find(d => d.casa === 'binance')?.promedio;
    
    if (oficial > 0 && binance > 0) {
      tasas.bcv = oficial;
      tasas.usdt = binance;
      tasas.euro = parseFloat((oficial * 1.08).toFixed(2));
      tasas.fecha = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' });
      
      if (dbLocal) {
        await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(() => {});
      }
      console.log(`[Agente] Éxito: BCV ${tasas.bcv} | USDT ${tasas.usdt}`);
    }
  } catch (error) {
    console.log("[Alerta] Fallo en API, se mantienen las tasas actuales.");
  }
}

async function setTasaManual(moneda, valor) {
  if(moneda === 'BCV') tasas.bcv = valor;
  if(moneda === 'USDT') tasas.usdt = valor;
  if(moneda === 'EURO') tasas.euro = valor;
  
  tasas.fecha = "Fijada Manualmente (Control Admin)";
  if (dbLocal) {
    await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(() => {});
  }
}

module.exports = { tasas, servicios, iniciar, actualizarTasas, setTasaManual };
