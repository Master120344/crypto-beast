// File: decoyKrakenBot.js
// DecoyKrakenBot: Elite decoy bot for manipulating prices on Kraken
// Connects to PriceSentryBot's WebSocket server to receive price data, places decoy orders to influence market
// Designed to link with PriceSentryBot, SpreadEagleBot, TradeMasterBot, DecoyCoinbaseBot, and EvolveGeniusBot

const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const DECOY_INTERVAL = 30000; // Place decoy orders every 30 seconds (in milliseconds)
const DECOY_ORDER_AMOUNT = 0.01; // Amount of BTC for decoy orders (small to avoid real impact)
const PRICE_OFFSET_PERCENTAGE = 0.5; // Place decoy orders 0.5% above/below current price
const ORDER_TYPE_BUY = 'buy';
const ORDER_TYPE_SELL = 'sell';
const DECOY_HISTORY_LIMIT = 200; // Maximum number of decoy order history entries to store in memory

// Current Kraken price (received from PriceSentryBot)
let krakenPrice = 0;

// Decoy order history for analysis and dashboard
let decoyHistory = [];

// Bot monitoring states for latency and updates
let monitoringData = {
    decoyKraken: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket client to connect to PriceSentryBot's server
const wsClient = new WebSocket(WEBSOCKET_SERVER_URL);

// Handle WebSocket connection events
wsClient.on('open', () => {
    log('Connected to PriceSentryBot WebSocket server');
});

wsClient.on('message', (message) => {
    try {
        const data = JSON.parse(message);
        if (data.type === 'price' && data.message.exchange.toLowerCase() === 'kraken') {
            krakenPrice = data.message.price;
            log(`Received Kraken BTC/USD Price: $${krakenPrice}`);
        }
    } catch (e) {
        log(`WebSocket message error: ${e.message}`);
    }
});

wsClient.on('error', (error) => {
    log(`WebSocket error: ${error.message}`);
});

wsClient.on('close', () => {
    log('Disconnected from PriceSentryBot WebSocket server. Attempting to reconnect...');
    setTimeout(() => {
        wsClient = new WebSocket(WEBSOCKET_SERVER_URL); // Reconnect after 5 seconds
    }, 5000);
});

// Log messages with timestamp for debugging and monitoring
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - DecoyKrakenBot: ${message}`);
    // Broadcast log to PriceSentryBot's WebSocket server for dashboard visibility
    if (wsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        wsClient.send(data);
    }
}

// Broadcast decoy order data to PriceSentryBot's WebSocket server for dashboard
function broadcastDecoyOrder(order) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'decoy', message: order, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
    }
}

// Broadcast monitoring data (latency, last update) to dashboard
function broadcastMonitoring(exchange, data) {
    const timestamp = new Date().toISOString();
    const dataPayload = JSON.stringify({ type: 'monitoring', message: { exchange, data }, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(dataPayload);
    }
}

// Place decoy orders on Kraken (logs intended orders for now)
async function placeDecoyOrders() {
    while (true) {
        const startTime = Date.now();
        try {
            if (krakenPrice <= 0) {
                log('Waiting for valid Kraken price data...');
                await new Promise(resolve => setTimeout(resolve, DECOY_INTERVAL));
                continue;
            }

            // Calculate decoy buy and sell prices (0.5% below/above current price)
            const buyPrice = krakenPrice * (1 - PRICE_OFFSET_PERCENTAGE / 100);
            const sellPrice = krakenPrice * (1 + PRICE_OFFSET_PERCENTAGE / 100);

            // Log decoy buy order (to be replaced with real API call once keys are available)
            const buyOrder = {
                exchange: 'Kraken',
                type: ORDER_TYPE_BUY,
                price: buyPrice,
                amount: DECOY_ORDER_AMOUNT,
                timestamp: startTime
            };
            log(`Placing decoy buy order: ${JSON.stringify(buyOrder)}`);
            decoyHistory.push(buyOrder);
            broadcastDecoyOrder(buyOrder);

            // Log decoy sell order (to be replaced with real API call once keys are available)
            const sellOrder = {
                exchange: 'Kraken',
                type: ORDER_TYPE_SELL,
                price: sellPrice,
                amount: DECOY_ORDER_AMOUNT,
                timestamp: startTime
            };
            log(`Placing decoy sell order: ${JSON.stringify(sellOrder)}`);
            decoyHistory.push(sellOrder);
            broadcastDecoyOrder(sellOrder);

            // Optimize memory by limiting decoy history
            if (decoyHistory.length > DECOY_HISTORY_LIMIT) {
                decoyHistory = decoyHistory.slice(-DECOY_HISTORY_LIMIT / 2);
            }

            // Update monitoring data
            monitoringData.decoyKraken.lastUpdate = startTime;
            monitoringData.decoyKraken.latency = Date.now() - startTime;
            broadcastMonitoring('DecoyKraken', monitoringData.decoyKraken);
        } catch (e) {
            log(`Decoy order error: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, DECOY_INTERVAL));
    }
}

// Start DecoyKrakenBot
async function startDecoyKrakenBot() {
    log('DecoyKrakenBot starting...');
    log('Waiting for price data from PriceSentryBot to place decoy orders on Kraken...');
    placeDecoyOrders();
}

// Execute the bot
startDecoyKrakenBot();