// File: decoyKrakenBot.js
// DecoyKrakenBot: Places decoy orders on Kraken to manipulate market perception
// Connects to PriceSentryBot's WebSocket server to receive price data
// Designed to link with PriceSentryBot, SpreadEagleBot, TradeMasterBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const DECOY_ORDER_INTERVAL = 10000; // Place decoy orders every 10 seconds
const DECOY_PRICE_OFFSET = 0.01; // 1% offset from market price for decoy orders
const INITIAL_CHECK_DELAY = 5000; // Delay initial price check by 5 seconds to ensure WebSocket messages are received

// Price tracking for Kraken (received from PriceSentryBot)
let krakenPrice = 0;

// Bot monitoring states for latency and updates
let monitoringData = {
    decoyKraken: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket client to connect to PriceSentryBot's server
let wsClient = new WebSocket(WEBSOCKET_SERVER_URL);

// Handle WebSocket connection events
wsClient.on('open', () => {
    log('Connected to PriceSentryBot WebSocket server');
});

wsClient.on('message', async (message) => {
    try {
        log(`Received WebSocket message: ${message}`);
        const data = JSON.parse(message.toString());
        if (data.type === 'price' && data.message.exchange.toLowerCase() === 'kraken') {
            krakenPrice = parseFloat(data.message.price);
            log(`Received Kraken BTC/USD Price: $${krakenPrice}`);
        } else {
            log(`Ignoring non-price message: ${JSON.stringify(data)}`);
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
    if (wsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        wsClient.send(data);
    }
}

// Broadcast decoy order data to PriceSentryBot's WebSocket server for dashboard
function broadcastDecoyOrder(order) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'decoyOrder', message: order, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
    }
}

// Place decoy orders on Kraken
function placeDecoyOrders() {
    const startTime = Date.now();
    try {
        if (krakenPrice <= 0) {
            log('Waiting for valid Kraken price data...');
            return;
        }

        // Simulate placing decoy orders (buy and sell slightly off market price)
        const buyPrice = krakenPrice * (1 - DECOY_PRICE_OFFSET);
        const sellPrice = krakenPrice * (1 + DECOY_PRICE_OFFSET);
        const amount = 0.001; // Small amount for decoy orders

        log(`Placing decoy orders on Kraken: Buy at $${buyPrice}, Sell at $${sellPrice}, Amount: ${amount} BTC`);
        broadcastDecoyOrder({ exchange: 'Kraken', buyPrice, sellPrice, amount });

        // Update monitoring data
        monitoringData.decoyKraken.lastUpdate = startTime;
        monitoringData.decoyKraken.latency = Date.now() - startTime;
    } catch (e) {
        log(`Decoy order placement error: ${e.message}`);
    }
}

// Start DecoyKrakenBot
function startDecoyKrakenBot() {
    log('DecoyKrakenBot starting...');
    log('Waiting for price data from PriceSentryBot to place decoy orders on Kraken...');

    // Delay the initial price check to ensure WebSocket messages are received
    setTimeout(() => {
        // Place decoy orders at regular intervals
        setInterval(placeDecoyOrders, DECOY_ORDER_INTERVAL);
    }, INITIAL_CHECK_DELAY);
}

// Execute the bot
startDecoyKrakenBot();
