const fs = require('fs');

const logFile = 'bot_logs.txt';

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    fs.appendFileSync(logFile, logMessage);
    console.log(logMessage.trim());
}

function logTrade(trade) {
    const message = `TRADE - Spread: $${trade.spread}, Buy: ${trade.buyExchange}, Sell: ${trade.sellExchange}, Timestamp: ${new Date(trade.timestamp).toISOString()}`;
    log(message);
}

function logMonitoring(exchange, data) {
    const message = `MONITORING - ${exchange}: Latency: ${data.latency}ms, Last Update: ${new Date(data.lastUpdate).toISOString()}`;
    log(message);
}

module.exports = { log, logTrade, logMonitoring };
