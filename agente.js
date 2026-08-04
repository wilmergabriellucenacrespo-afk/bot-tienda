// agente.js - Motor Financiero con Memoria Persistente (Anti-Cero)
let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Sincronizando..." };
let dbLocal;

// --- EL CATÁLOGO INTELIGENTE ---
const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", costo: 2.20, precio_usdt: 3.80, precio_euro: 4.00, precio_bcv: 4.50 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", costo: 1.00, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", costo: 0.90, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 }
];

async function iniciar(db) {
  dbLocal = db;
  
  // 1. RECUPERAR MEMORIA: Evita arrancar en 0 si Render se reinicia y la API nos bloquea
  try {
    const doc = await dbLocal.collection('sistema').doc('tasas_memoria').get();
    if (doc.exists && doc.data().bcv > 0) {
      tasas = doc.data();
      console.log("[Memoria] Tasas recuperadas de Firebase con éxito.");
    }
  } catch (error) { console.log("No hay registro previo en Firebase."); }
  
  // 2. INTENTAR LEER TASAS NUEVAS
  await actualizarTasas();
  
  // 3. ACTIVAR CICLOS AUTOMÁTICOS
  setInterval(actualizarTasas, 43200000); // Tasas: Cada 12 horas
  setInterval(verificarMercado, 604800000); // Mercado: Cada 7 días
}

async function actualizarTasas() {
  let exito = false;
  let t_bcv = 0, t_usdt = 0, t_eur = 0;
  
  // Camuflaje dinámico
  const headers = { 
    'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/${Math.floor(Math.random() * 20) + 100}.0.0.0`,
    'Accept': 'application/json'
  };

  // API 1: PyDolar
  if (!exito) {
    try {
      const [resUsd, resEur] = await Promise.all([
        fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar', { headers }),
        fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro', { headers })
      ]);
      const dataUsd = await resUsd.json();
      const dataEur = await resEur.json();

      if (dataUsd.monitors?.bcv?.price > 0) t_bcv = dataUsd.monitors.bcv.price;
      if (dataUsd.monitors?.binance?.price > 0) t_usdt = dataUsd.monitors.binance.price;
      if (dataEur.monitors?.bcv?.price > 0) t_eur = dataEur.monitors.bcv.price;
      
      if (t_bcv > 0 && t_usdt > 0) exito = true;
    } catch (e) {}
  }

  // API 2: DolarAPI (Respaldo si la primera falla)
  if (!exito) {
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares', { headers });
      const data = await res.json();
      const oficial = data.find(d => d.casa === 'oficial')?.promedio;
      const binance = data.find(d => d.casa === 'binance')?.promedio;
      
      if (oficial > 0) t_bcv = oficial;
      if (binance > 0) t_usdt = binance;
      t_eur = oficial * 1.08; 
      
      if (t_bcv > 0 && t_usdt > 0) exito = true;
    } catch (e) {}
  }

  // APLICAR SOLO SI LA LECTURA FUE REAL (MAYOR A CERO)
  if (exito && t_bcv > 0) {
    tasas.bcv = t_bcv;
    tasas.usdt = t_usdt;
    tasas.euro = t_eur;
    tasas.fecha = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' });
    
    // GUARDAR EN FIREBASE PARA EL FUTURO
    if (dbLocal) await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas);
    console.log(`[Agente] Lectura exitosa: BCV ${tasas.bcv} | USDT ${tasas.usdt}`);
  } else {
    console.log(`[Alerta] APIs bloqueadas. Usando última memoria válida: BCV ${tasas.bcv}`);
  }
}

async function verificarMercado() {
  try {
    const costosMercadoActual = { "netflix": 2.50, "spotify": 0.80 };
    servicios.forEach(srv => {
      let nuevoCosto = costosMercadoActual[srv.id];
      if (nuevoCosto && nuevoCosto > srv.costo) {
        let dif = nuevoCosto - srv.costo;
        srv.costo = nuevoCosto;
        srv.precio_usdt = parseFloat((srv.precio_usdt + dif).toFixed(2));
        srv.precio_euro = parseFloat((srv.precio_euro + dif).toFixed(2));
        srv.precio_bcv = parseFloat((srv.precio_bcv + dif).toFixed(2));
      }
    });
  } catch (error) {}
}

module.exports = { tasas, servicios, iniciar, actualizarTasas };
