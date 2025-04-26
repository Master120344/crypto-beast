// File: decoyCoinbaseBot.js
// DecoyCoinbaseBot: Places decoy orders on Coinbase to manipulate market perception
// Connects to PriceSentryBot's WebSocket server to receive price data
// Designed to link with PriceSentryBot, SpreadEagleBot, TradeMasterBot, DecoyKrakenBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const DECOY_ORDER_INTERVAL = 10000; // Place decoy orders every 10 seconds
const DECOY_PRICE_OFFSET = 0.01; // 1% offset from market price for decoy orders

// Price tracking for Coinbase (received from PriceSentryBot)
let coinbasePrice = 0;

// Bot monitoring states for latency and updates
let monitoringData = {
    decoyCoinbase: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket client to connect to PriceSentryBot's server
let wsClient = new WebSocket(WEBSOCKET_SERVER_URL);

// Handle WebSocket connection events
wsClient.on('open', () => {
    log('Connected to PriceSentryBot WebSocket server');
});

wsClient.on('message', async (message) => {
    try {
        const data = JSON.parse(message);
        if (data.type === 'price' && data.message.exchange.toLowerCase() === 'coinbase') {
            coinbasePrice = data.message.price;
            log(`Received Coinbase BTC/USD Price: $${coinbasePrice}`);
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
    console.log(`${timestamp} - DecoyCoinbaseBot: ${message}`);
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

// Place decoy orders on Coinbase
function placeDecoyOrders() {
    const startTime = Date.now();
    try {
        if (coinbasePrice <= 0) {
            log('Waiting for valid Coinbase price data...');
            return;
        }

        // Simulate placing decoy orders (buy and sell slightly off market price)
        const buyPrice = coinbasePrice * (1 - DECOY_PRICE_OFFSET);
        const sellPrice = coinbasePrice * (1 + DECOY_PRICE_OFFSET);
        const amount = 0.001; // Small amount for decoy orders

        log(`Placing decoy orders on Coinbase: Buy at $${buyPrice}, Sell at $${sellPrice}, Amount: ${amount} BTC`);
        broadcastDecoyOrder({ exchange: 'Coinbase', buyPrice, sellPrice, amount });

        // Update monitoring data
        monitoringData.decoyCoinbase.lastUpdate = startTime;
        monitoringData.decoyCoinbase.latency = Date.now() - startTime;
    } catch (e) {
        log(`Decoy order placement error: ${e.message}`);
    }
}

// Start DecoyCoinbaseBot
function startDecoyCoinbaseBot() {
    log('DecoyCoinbaseBot starting...');
    log('Waiting for price data from PriceSentryBot to place decoy orders on Coinbase...');

    // Place decoy orders at regular intervals
    setInterval(placeDecoyOrders, DECOY_ORDER_INTERVAL);
}

// Execute the bot
startDecoyCoinbaseBot();
