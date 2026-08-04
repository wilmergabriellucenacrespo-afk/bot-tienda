// agente.js - Motor financiero independiente (PyDolarVenezuela API)
const tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Calculando..." };

async function actualizarTasas() {
  try {
    const req = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar');
    const data = await req.json();
    
    const reqEur = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro');
    const dataEur = await reqEur.json();

    if (data.monitors && data.monitors.bcv) tasas.bcv = data.monitors.bcv.price;
    if (data.monitors && data.monitors.binance) tasas.usdt = data.monitors.binance.price;
    if (dataEur.monitors && dataEur.monitors.bcv) tasas.euro = dataEur.monitors.bcv.price;
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
    
    console.log(`[Agente] Tasas actualizadas: BCV ${tasas.bcv} | USDT ${tasas.usdt} | EURO ${tasas.euro}`);
  } catch (error) { 
    console.log("Error de red en la API de tasas. Reintentando en el próximo ciclo."); 
  }
}

// Se ejecuta al instante y luego cada 12 horas (43,200,000 ms)
actualizarTasas();
setInterval(actualizarTasas, 43200000);

module.exports = { tasas, actualizarTasas };
