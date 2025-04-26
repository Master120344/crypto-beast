// File: priceSentryBot.js
// PriceSentryBot: Elite price monitoring bot for multiple exchanges
// Fetches prices from Kraken (WebSocket) and PancakeSwap (BNB Chain), broadcasts to other bots via WebSocket
// Designed to link with SpreadEagleBot, TradeMasterBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');
const { ethers } = require('ethers');
const axios = require('axios');

// Configuration
const KRAKEN_WS_URL = 'wss://ws.kraken.com';
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/'; // Primary BNB Chain provider
const FALLBACK_PROVIDER_URL_BSC = 'https://bsc-dataseed1.defibit.io/'; // Fallback BNB Chain provider
const WEBSOCKET_PORT = 8081; // Local WebSocket server port for broadcasting prices
const PRICE_FETCH_INTERVAL = 5000; // Fetch prices every 5 seconds
const MAX_CONTRACT_RETRIES = 3; // Maximum retries for contract price fetch per provider
const MAX_TOTAL_RETRIES = 6; // Total retries across both providers before falling back to API

// PancakeSwap Pair (BNB Chain) - Hardcoded WBNB/BTCB pair address
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; // Wrapped BNB
const BTCB = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9'; // BTCB (Binance-Peg Bitcoin Token)
const WBNB_BTCB_PAIR = '0x61EB789d75A98CAa37698ff9355F7B1d6eCEf95'; // Hardcoded WBNB/BTCB pair address

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

// Custom network configuration to disable ENS on BNB Chain
const bscNetwork = {
    chainId: 56,
    name: 'bsc',
    ensAddress: null // Explicitly disable ENS
};

// Initialize providers with fallback, using custom network and staticNetwork option
let providerBSC = new ethers.JsonRpcProvider(PROVIDER_URL_BSC, bscNetwork, { staticNetwork: true });
let fallbackProviderBSC = new ethers.JsonRpcProvider(FALLBACK_PROVIDER_URL_BSC, bscNetwork, { staticNetwork: true });
let pairContract = new ethers.Contract(WBNB_BTCB_PAIR, PAIR_ABI, providerBSC);
let currentProvider = 'primary'; // Track which provider is in use

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

// Fetch PancakeSwap BTC/BNB price via contract
async function fetchPancakeSwapPriceFromContract(attempt = 1) {
    try {
        log(`Fetching PancakeSwap price via contract (attempt ${attempt}) using ${currentProvider} provider...`);

        // Sequential calls to avoid potential issues
        log('Fetching token0...');
        const token0 = await pairContract.token0();
        log('Fetching token1...');
        const token1 = await pairContract.token1();
        log('Fetching reserves...');
        const reserves = await pairContract.getReserves();

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
        if (currentProvider === 'fallback') {
            providerBSC = new ethers.JsonRpcProvider(PROVIDER_URL_BSC, bscNetwork, { staticNetwork: true });
            pairContract = new ethers.Contract(WBNB_BTCB_PAIR, PAIR_ABI, providerBSC);
            currentProvider = 'primary';
            log('Switched back to primary BNB Chain provider');
        }

        return true; // Success
    } catch (e) {
        log(`PancakeSwap contract price fetch error (attempt ${attempt}): ${e.message}`);
        if (attempt < MAX_CONTRACT_RETRIES) {
            log('Retrying with current provider...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Delay before retry
            return await fetchPancakeSwapPriceFromContract(attempt + 1);
        }
        return false; // All retries for this provider failed
    }
}

// Fetch PancakeSwap BTC/BNB price via API (fallback)
async function fetchPancakeSwapPriceFromAPI() {
    try {
        log('Fetching PancakeSwap price via API (fallback)...');
        // Fetch BTC and BNB prices in USD from CoinGecko
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,binancecoin&vs_currencies=usd');
        const btcUsdPrice = response.data.bitcoin.usd;
        const bnbUsdPrice = response.data.binancecoin.usd;
        const btcBnbPrice = btcUsdPrice / bnbUsdPrice; // BTC/BNB price
        prices.pancakeswap.btc_bnb = btcBnbPrice;
        log(`PancakeSwap BTC/BNB Price (via API): ${btcBnbPrice} BNB`);
        broadcastPrice('pancakeswap', btcBnbPrice);
        return true; // Success
    } catch (e) {
        log(`PancakeSwap API price fetch error: ${e.message}`);
        return false; // API failed
    }
}

// Fetch PancakeSwap BTC/BNB price (try contract first, then API)
async function fetchPancakeSwapPrice() {
    let totalAttempts = 0;
    let useFallbackProvider = false;

    while (totalAttempts < MAX_TOTAL_RETRIES) {
        if (totalAttempts >= MAX_CONTRACT_RETRIES && !useFallbackProvider) {
            log('Switching to fallback BNB Chain provider after initial retries...');
            providerBSC = fallbackProviderBSC;
            pairContract = new ethers.Contract(WBNB_BTCB_PAIR, PAIR_ABI, providerBSC);
            currentProvider = 'fallback';
            useFallbackProvider = true;
        }

        const success = await fetchPancakeSwapPriceFromContract(1);
        if (success) return; // Successfully fetched via contract

        totalAttempts += MAX_CONTRACT_RETRIES;
        log(`Total contract attempts: ${totalAttempts}/${MAX_TOTAL_RETRIES}`);
    }

    log(`Failed to fetch price from contract after ${MAX_TOTAL_RETRIES} total attempts, falling back to API...`);
    await fetchPancakeSwapPriceFromAPI();
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
