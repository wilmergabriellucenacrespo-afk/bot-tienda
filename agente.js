// agente.js - Motor Financiero y Analista de Mercado

let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Calculando tasas reales..." };

// EL CATÁLOGO AHORA VIVE AQUÍ PARA QUE EL AGENTE LO CONTROLE
const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", costo: 2.20, precio_usdt: 3.80, precio_euro: 4.00, precio_bcv: 4.50 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", costo: 1.00, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", costo: 0.90, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 }
];

// -----------------------------------------------------
// LÓGICA 1: ACTUALIZACIÓN DE TASAS DE MONEDA (CADA 12H)
// -----------------------------------------------------
async function actualizarTasas() {
  let exito = false;
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares', { headers });
    const data = await res.json();
    let oficial = data.find(d => d.casa === 'oficial')?.promedio || 0;
    let binance = data.find(d => d.casa === 'binance')?.promedio || 0;
    let eur = data.find(d => d.casa === 'euro')?.promedio || 0;
    
    if (oficial > 0 && binance > 0) {
      tasas.bcv = oficial; tasas.usdt = binance; tasas.euro = eur > 0 ? eur : (oficial * 1.08);
      exito = true;
    }
  } catch (e) {}

  if (!exito) {
    try {
      const res2 = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar', { headers });
      const data2 = await res2.json();
      const resEur = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro', { headers });
      const dataEur = await resEur.json();

      if (data2.monitors && data2.monitors.bcv.price > 0) {
        tasas.bcv = data2.monitors.bcv.price;
        tasas.usdt = data2.monitors.binance.price;
        tasas.euro = dataEur.monitors.bcv.price;
        exito = true;
      }
    } catch (e) {}
  }

  if (exito) {
    const opts = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opts);
    console.log(`[Tasas] BCV: ${tasas.bcv} | USDT: ${tasas.usdt} | EUR: ${tasas.euro}`);
  } else {
    setTimeout(actualizarTasas, 15000);
  }
}

// -----------------------------------------------------
// LÓGICA 2: REVISIÓN DE MERCADO (CADA 7 DÍAS)
// Regla estricta: EL PRECIO NUNCA BAJA.
// -----------------------------------------------------
async function verificarMercado() {
  try {
    // Aquí el agente se conectaría a la API de tu proveedor o foro mayorista.
    // Simulamos un archivo de base de datos de proveedores para el ejemplo.
    // Supongamos que Netflix subió a 2.50 y Spotify bajó a 0.80.
    
    const costosMercadoActual = {
      "netflix": 2.50,  // Subió
      "spotify": 0.80   // Bajó
    };

    servicios.forEach(srv => {
      let nuevoCosto = costosMercadoActual[srv.id];
      
      // SI EL PROVEEDOR SUBE EL PRECIO: Ajustamos para no perder ganancia
      if (nuevoCosto && nuevoCosto > srv.costo) {
        let diferenciaAumento = nuevoCosto - srv.costo;
        
        srv.costo = nuevoCosto; // Actualizamos inversión
        
        // Aumentamos el precio de venta exactamente en la misma proporción
        srv.precio_usdt = parseFloat((srv.precio_usdt + diferenciaAumento).toFixed(2));
        srv.precio_euro = parseFloat((srv.precio_euro + diferenciaAumento).toFixed(2));
        srv.precio_bcv = parseFloat((srv.precio_bcv + diferenciaAumento).toFixed(2));
        
        console.log(`[Mercado] ⚠️ ALERTA: ${srv.nombre} subió de precio. Catálogo ajustado automáticamente.`);
      }
      
      // SI EL PROVEEDOR BAJA EL PRECIO: Lo ignoramos, mantenemos la venta alta (Regla de Trinquete)
      else if (nuevoCosto && nuevoCosto < srv.costo) {
        console.log(`[Mercado] 📉 ${srv.nombre} bajó de precio en proveedores. Manteniendo precio de venta alto para mayor ganancia.`);
      }
    });
  } catch (error) {
    console.log("Error consultando el mercado de proveedores.");
  }
}

actualizarTasas();
setInterval(actualizarTasas, 43200000); // Tasas: 12 horas

verificarMercado();
setInterval(verificarMercado, 604800000); // Mercado: Cada 7 días (604,800,000 ms)

module.exports = { tasas, actualizarTasas, servicios };
