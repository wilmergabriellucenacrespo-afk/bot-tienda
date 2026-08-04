// agente.js - Motor financiero blindado anti-bloqueos
const tasas = { 
  usdt: 41.50, // Valores de respaldo fijos (no pueden ser 0)
  euro: 44.00, 
  bcv: 36.60, 
  fecha: "Tasa de respaldo (API en mantenimiento)" 
};

async function actualizarTasas() {
  try {
    const req = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar');
    const data = await req.json();
    
    const reqEur = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro');
    const dataEur = await reqEur.json();

    let nuevaBcv = tasas.bcv;
    let nuevaUsdt = tasas.usdt;
    let nuevaEuro = tasas.euro;

    // Solo tomamos el número de la API si realmente existe y es mayor a 0
    if (data && data.monitors && data.monitors.bcv && data.monitors.bcv.price > 0) {
      nuevaBcv = data.monitors.bcv.price;
    }
    if (data && data.monitors && data.monitors.binance && data.monitors.binance.price > 0) {
      nuevaUsdt = data.monitors.binance.price;
    }
    if (dataEur && dataEur.monitors && dataEur.monitors.bcv && dataEur.monitors.bcv.price > 0) {
      nuevaEuro = dataEur.monitors.bcv.price;
    }

    // Aplicamos los valores seguros
    tasas.bcv = nuevaBcv;
    tasas.usdt = nuevaUsdt;
    tasas.euro = nuevaEuro;
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
    
    console.log(`[Agente] Tasas actualizadas: BCV ${tasas.bcv} | USDT ${tasas.usdt} | EURO ${tasas.euro}`);
    
  } catch (error) { 
    console.log("Bloqueo de API detectado. El sistema mantendrá las tasas de respaldo para evitar precios en 0."); 
  }
}

// Se ejecuta al instante y luego cada 12 horas (43,200,000 ms)
actualizarTasas();
setInterval(actualizarTasas, 43200000);

module.exports = { tasas, actualizarTasas };
