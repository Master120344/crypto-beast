// File: priceSentryBot.js
// PriceSentryBot: Elite price monitoring bot for real-time exchange data fetching
// Integrates with Kraken (WebSocket) and Coinbase (REST API), broadcasts data via WebSocket server
// Designed to link with SpreadEagleBot, TradeMasterBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');

// Configuration
const KRAKEN_WS = 'wss://ws.kraken.com'; // Kraken WebSocket API for real-time price data
const COINBASE_API = 'https://api.coinbase.com/v2/prices/BTC-USD/spot'; // Coinbase REST API for price data
const WEBSOCKET_PORT = 8081; // Port for WebSocket server to broadcast price data
const PRICE_FETCH_INTERVAL_COINBASE = 5000; // Fetch Coinbase price every 5 seconds (in milliseconds)
const PRICE_HISTORY_LIMIT = 1000; // Maximum number of price history entries to store in memory

// Price tracking across exchanges
let prices = {
    kraken: { btc_usd: 0 },
    coinbase: { btc_usd: 0 }
};

// Price history for analysis and dashboard
let priceHistory = [];

// Bot monitoring states for latency and updates
let monitoringData = {
    kraken: { latency: 0, lastUpdate: 0 },
    coinbase: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket server to broadcast price data to other bots and dashboard
const wss = new WebSocket.Server({ port: WEBSOCKET_PORT });

// Log when WebSocket clients (other bots or dashboard) connect/disconnect
wss.on('connection', (ws) => {
    console.log(`${new Date().toISOString()} - PriceSentryBot: WebSocket client connected`);
    ws.on('close', () => console.log(`${new Date().toISOString()} - PriceSentryBot: WebSocket client disconnected`));
});

// Broadcast price data to all connected WebSocket clients (SpreadEagleBot, dashboard, etc.)
function broadcastPrice(exchange, price) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'price', message: { exchange, price }, timestamp });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Broadcast monitoring data (latency, last update) to dashboard
function broadcastMonitoring(exchange, data) {
    const timestamp = new Date().toISOString();
    const dataPayload = JSON.stringify({ type: 'monitoring', message: { exchange, data }, timestamp });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(dataPayload);
        }
    });
}

// Log messages with timestamp for debugging and monitoring
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - PriceSentryBot: ${message}`);
    // Broadcast log to dashboard for real-time visibility
    const data = JSON.stringify({ type: 'log', message, timestamp });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Kraken Price Fetching (WebSocket)
const krakenSocket = new WebSocket(KRAKEN_WS);
krakenSocket.on('open', () => {
    log('Kraken WebSocket connection established');
    krakenSocket.send(JSON.stringify({
        event: 'subscribe',
        pair: ['BTC/USD'],
        subscription: { name: 'ticker' }
    }));
});

krakenSocket.on('message', (msg) => {
    const startTime = Date.now();
    try {
        const data = JSON.parse(msg);
        if (data[1] && data[1].c) {
            prices.kraken.btc_usd = parseFloat(data[1].c[0]);
            priceHistory.push({ exchange: 'Kraken', pair: 'BTC/USD', price: prices.kraken.btc_usd, timestamp: startTime });
            monitoringData.kraken.lastUpdate = startTime;
            monitoringData.kraken.latency = Date.now() - startTime;
            log(`Kraken BTC/USD Price: $${prices.kraken.btc_usd}`);
            broadcastPrice('Kraken', prices.kraken.btc_usd);
            broadcastMonitoring('Kraken', monitoringData.kraken);
            // Optimize memory by limiting price history
            if (priceHistory.length > PRICE_HISTORY_LIMIT) {
                priceHistory = priceHistory.slice(-PRICE_HISTORY_LIMIT / 2);
            }
        }
    } catch (e) {
        log(`Kraken WebSocket error: ${e.message}`);
    }
});

krakenSocket.on('error', (error) => {
    log(`Kraken WebSocket error: ${error.message}`);
});

krakenSocket.on('close', () => {
    log('Kraken WebSocket connection closed. Attempting to reconnect...');
    setTimeout(() => {
        krakenSocket = new WebSocket(KRAKEN_WS); // Reconnect after 5 seconds
    }, 5000);
});

// Coinbase Price Fetching (REST API)
async function fetchCoinbasePrice() {
    while (true) {
        const startTime = Date.now();
        try {
            const response = await axios.get(COINBASE_API);
            prices.coinbase.btc_usd = parseFloat(response.data.data.amount);
            priceHistory.push({ exchange: 'Coinbase', pair: 'BTC/USD', price: prices.coinbase.btc_usd, timestamp: startTime });
            monitoringData.coinbase.lastUpdate = startTime;
            monitoringData.coinbase.latency = Date.now() - startTime;
            log(`Coinbase BTC/USD Price: $${prices.coinbase.btc_usd}`);
            broadcastPrice('Coinbase', prices.coinbase.btc_usd);
            broadcastMonitoring('Coinbase', monitoringData.coinbase);
            // Optimize memory by limiting price history
            if (priceHistory.length > PRICE_HISTORY_LIMIT) {
                priceHistory = priceHistory.slice(-PRICE_HISTORY_LIMIT / 2);
            }
        } catch (e) {
            log(`Coinbase API fetch failed: ${e.message}`);
            log(`Coinbase API error details: ${JSON.stringify(e)}`);
        }
        await new Promise(resolve => setTimeout(resolve, PRICE_FETCH_INTERVAL_COINBASE));
    }
}

// Start PriceSentryBot
async function startPriceSentryBot() {
    log('PriceSentryBot starting...');
    log('Fetching prices from Kraken (WebSocket) and Coinbase (REST API)');
    fetchCoinbasePrice(); // Start Coinbase price fetching
}

// Execute the bot
startPriceSentryBot();