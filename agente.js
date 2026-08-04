// agente.js - Motor financiero independiente
let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Calculando..." };

async function actualizarTasas() {
  try {
    const [reqBcv, reqBinance, reqEuro] = await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'), // Tasa oficial BCV
      fetch('https://ve.dolarapi.com/v1/dolares/binance'),
      fetch('https://ve.dolarapi.com/v1/dolares/euro')
    ]);
    
    const dataBcv = await reqBcv.json();
    const dataBinance = await reqBinance.json();
    const dataEuro = await reqEuro.json();

    tasas.bcv = dataBcv.promedio || 0;
    tasas.usdt = dataBinance.promedio || 0;
    tasas.euro = dataEuro.promedio || 0;
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
    console.log(`[Agente] Tasas actualizadas: BCV ${tasas.bcv} | USDT ${tasas.usdt}`);
  } catch (error) { 
    console.log("Error en el agente de tasas:", error); 
  }
}

// Configuración del reloj (Actualiza de inmediato y luego cada 12 horas)
actualizarTasas();
setInterval(actualizarTasas, 43200000); // 43,200,000 ms = 12 horas exactas

module.exports = tasas;
