// File: priceSentryBot.js
// PriceSentryBot: Elite price monitoring bot for multiple exchanges
// Fetches prices from Kraken (WebSocket) and PancakeSwap (BNB Chain), broadcasts to other bots via WebSocket
// Designed to link with SpreadEagleBot, TradeMasterBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');
const { ethers } = require('ethers');

// Configuration
const KRAKEN_WS_URL = 'wss://ws.kraken.com';
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/'; // Primary BNB Chain provider
const FALLBACK_PROVIDER_URL_BSC = 'https://bsc-dataseed1.defibit.io/'; // Fallback BNB Chain provider
const WEBSOCKET_PORT = 8081; // Local WebSocket server port for broadcasting prices
const PRICE_FETCH_INTERVAL = 5000; // Fetch prices every 5 seconds

// PancakeSwap Pair (BNB Chain) - Hardcoded WBNB/BTCB pair address
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; // Wrapped BNB
const BTCB = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9'; // BTCB (Binance-Peg Bitcoin Token)
const WBNB_BTCB_PAIR = '0x46c6bA71AF7658cd7B0b21D47E1Ca4358c270b0'; // Hardcoded WBNB/BTCB pair address

// PancakeSwap Pair ABI (simplified)
const PAIR_ABI = [
    {
        "constant": true,
        "inputs": [],
        "name": "getReserves",
        "outputs": [
            { "name": "reserve0", "type": "uint112" },
            { "name": "reserve1", "type": "uint112" },
            { "name": "blockTimestampLast", "type": "uint32" }
        ],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "token0",
        "outputs": [{ "name": "", "type": "address" }],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "token1",
        "outputs": [{ "name": "", "type": "address" }],
        "type": "function"
    }
];

// Initialize providers with fallback
let providerBSC = new ethers.JsonRpcProvider(PROVIDER_URL_BSC);
let fallbackProviderBSC = new ethers.JsonRpcProvider(FALLBACK_PROVIDER_URL_BSC);
let pairContract = new ethers.Contract(WBNB_BTCB_PAIR, PAIR_ABI, providerBSC);

// Prices for exchanges (Kraken, PancakeSwap)
let prices = {
    kraken: { btc_usd: 0, bnb_usd: 0 },
    pancakeswap: { btc_bnb: 0 }
};

// WebSocket server to broadcast price data to other bots
const wsServer = new WebSocket.Server({ port: WEBSOCKET_PORT });

// Log messages with timestamp for debugging and monitoring
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - PriceSentryBot: ${message}`);
}

// Broadcast price data to all connected WebSocket clients
function broadcastPrice(exchange, price) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'price', message: { exchange, price }, timestamp });
    wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Broadcast monitoring data (latency, last update) to all connected WebSocket clients
function broadcastMonitoring(exchange, data) {
    const timestamp = new Date().toISOString();
    const dataPayload = JSON.stringify({ type: 'monitoring', message: { exchange, data }, timestamp });
    wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(dataPayload);
        }
    });
}

// Fetch PancakeSwap BTC/BNB price with fallback provider
async function fetchPancakeSwapPrice(attempt = 1) {
    try {
        log(`Fetching PancakeSwap price (attempt ${attempt})...`);
        const [token0, token1, reserves] = await Promise.all([
            pairContract.token0(),
            pairContract.token1(),
            pairContract.getReserves()
        ]);

        log(`Fetched pair data: token0=${token0}, token1=${token1}`);

        const reserve0 = Number(ethers.formatUnits(reserves.reserve0, 18));
        const reserve1 = Number(ethers.formatUnits(reserves.reserve1, 18));

        log(`Reserves: reserve0=${reserve0}, reserve1=${reserve1}`);

        // Determine which token is WBNB and which is BTCB
        const isWBNBToken0 = token0.toLowerCase() === WBNB.toLowerCase();
        const reserveWBNB = isWBNBToken0 ? reserve0 : reserve1;
        const reserveBTCB = isWBNBToken0 ? reserve1 : reserve0;

        const btcBnbPrice = reserveWBNB / reserveBTCB; // BTC/BNB price
        prices.pancakeswap.btc_bnb = btcBnbPrice;
        log(`PancakeSwap BTC/BNB Price: ${btcBnbPrice} BNB`);
        broadcastPrice('pancakeswap', btcBnbPrice);

        // Reset provider to primary if using fallback
        if (providerBSC !== providerBSC) {
            providerBSC = new ethers.JsonRpcProvider(PROVIDER_URL_BSC);
            pairContract = new ethers.Contract(WBNB_BTCB_PAIR, PAIR_ABI, providerBSC);
            log('Switched back to primary BNB Chain provider');
        }
    } catch (e) {
        log(`PancakeSwap price fetch error (attempt ${attempt}): ${e.message}`);
        if (attempt < 3) {
            log('Retrying with primary provider...');
            setTimeout(() => fetchPancakeSwapPrice(attempt + 1), 2000);
        } else {
            log('Switching to fallback BNB Chain provider...');
            providerBSC = fallbackProviderBSC;
            pairContract = new ethers.Contract(WBNB_BTCB_PAIR, PAIR_ABI, providerBSC);
            setTimeout(() => fetchPancakeSwapPrice(1), 2000);
        }
    }
}

// Kraken WebSocket client for real-time price data
let krakenWsClient;
function connectKrakenWebSocket() {
    krakenWsClient = new WebSocket(KRAKEN_WS_URL);

    krakenWsClient.on('open', () => {
        log('Kraken WebSocket connection established');
        // Subscribe to BTC/USD and BNB/USD ticker
        const subscribeMessage = JSON.stringify({
            event: 'subscribe',
            pair: ['XBT/USD', 'BNB/USD'],
            subscription: { name: 'ticker' }
        });
        krakenWsClient.send(subscribeMessage);
    });

    krakenWsClient.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            if (Array.isArray(message) && message.length > 1 && message[2] === 'ticker') {
                const ticker = message[1];
                const pair = message[3];
                if (pair === 'XBT/USD') {
                    const btcPrice = parseFloat(ticker.c[0]);
                    prices.kraken.btc_usd = btcPrice;
                    log(`Kraken BTC/USD Price: $${btcPrice}`);
                    broadcastPrice('kraken', btcPrice);
                } else if (pair === 'BNB/USD') {
                    const bnbPrice = parseFloat(ticker.c[0]);
                    prices.kraken.bnb_usd = bnbPrice;
                    log(`Kraken BNB/USD Price: $${bnbPrice}`);
                    broadcastPrice('kraken_bnb', bnbPrice);
                }
            }
        } catch (e) {
            log(`Kraken WebSocket message error: ${e.message}`);
        }
    });

    krakenWsClient.on('error', (error) => {
        log(`Kraken WebSocket error: ${error.message}`);
    });

    krakenWsClient.on('close', () => {
        log('Kraken WebSocket connection closed. Reconnecting...');
        setTimeout(connectKrakenWebSocket, 5000);
    });
}

// Start PriceSentryBot
async function startPriceSentryBot() {
    log('PriceSentryBot starting...');
    log('Fetching prices from Kraken (WebSocket) and PancakeSwap (BNB Chain)');

    // Start WebSocket server for broadcasting to other bots
    wsServer.on('connection', (ws) => {
        log('WebSocket client connected');
        ws.on('error', (error) => log(`WebSocket server error: ${error.message}`));
    });

    // Connect to Kraken WebSocket
    connectKrakenWebSocket();

    // Fetch PancakeSwap prices at intervals
    setInterval(fetchPancakeSwapPrice, PRICE_FETCH_INTERVAL);

    // Monitor latency and updates for Kraken and PancakeSwap
    setInterval(() => {
        const now = Date.now();
        broadcastMonitoring('Kraken', { latency: 0, lastUpdate: now });
        broadcastMonitoring('PancakeSwap', { latency: 0, lastUpdate: now });
    }, 10000);
}

// Execute the bot
startPriceSentryBot();
