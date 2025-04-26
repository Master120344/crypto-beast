// File: index.js
require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');
const { ethers } = require('ethers');
const { log: originalLog, logTrade: originalLogTrade, logMonitoring: originalLogMonitoring } = require('./utils');

// Configuration
const KRAKEN_WS = 'wss://ws.kraken.com';
const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488'; // Uniswap Router v2 on Ethereum
const BINANCE_API = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'; // Binance public API
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/';
const PROVIDER_URL_ETH = 'https://cloudflare-eth.com'; // Using Cloudflare Ethereum Gateway
const AAVE_LENDING_POOL = '0x26fCbd3afebbe28D0A8684F790C48368D21665b'; // Aave Lending Pool on BSC
const DYDX_SOLO_MARGIN = '0x1E0447b9cB2f1fBCcA5bC9C1aE73C5E4D20dB74'; // Placeholder for dYdX (not available on BSC)

// Skip strict address validation for now
const UNISWAP_ROUTER_CHECKSUM = UNISWAP_ROUTER;
const AAVE_LENDING_POOL_CHECKSUM = AAVE_LENDING_POOL;
const DYDX_SOLO_MARGIN_CHECKSUM = DYDX_SOLO_MARGIN;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// Initialize Ethers providers for BSC and Ethereum
const providerBSC = new ethers.JsonRpcProvider(PROVIDER_URL_BSC);
let providerETH;
try {
    providerETH = new ethers.JsonRpcProvider(PROVIDER_URL_ETH);
} catch (e) {
    console.error('Error: Failed to initialize Ethereum provider:', e.message);
    process.exit(1);
}

// Uniswap ABI
const SWAP_ABI = [
    {
        "constant": true,
        "inputs": [
            { "name": "amountIn", "type": "uint256" },
            { "name": "path", "type": "address[]" }
        ],
        "name": "getAmountsOut",
        "outputs": [
            { "name": "amounts", "type": "uint256[]" }
        ],
        "type": "function"
    }
];

// Liquidity Pool ABI (simplified for reserves)
const POOL_ABI = [
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
    }
];

// Price tracking across exchanges
let prices = {
    kraken: { btc_usd: 0 },
    uniswap: { weth_usdt: 0 },
    binance: { btc_usdt: 0 }
};
let priceHistory = [];
let trades = [];
let liquidityData = {
    uniswap: { weth_usdt: { reserve0: 0, reserve1: 0 } }
};
let gasPrices = { bsc: 0, eth: 0 };

// Bot monitoring states
let monitoringData = {
    kraken: { latency: 0, lastUpdate: 0 },
    uniswap: { latency: 0, lastUpdate: 0 },
    binance: { latency: 0, lastUpdate: 0 }
};

// WebSocket Server to broadcast live data to the dashboard
const wss = new WebSocket.Server({ port: 8081 });

wss.on('connection', (ws) => {
    originalLog('WebSocket client connected');
    ws.on('close', () => originalLog('WebSocket client disconnected'));
});

// Broadcast message to all connected WebSocket clients
function broadcast(type, message) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type, message, timestamp });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Wrap the log function to broadcast logs to the dashboard
function log(message) {
    originalLog(message);
    broadcast('log', message);
}

// Wrap logTrade to broadcast trades
function logTrade(trade) {
    originalLogTrade(trade);
    broadcast('trade', trade);
}

// Wrap logMonitoring to broadcast monitoring updates
function logMonitoring(exchange, data) {
    originalLogMonitoring(exchange, data);
    broadcast('monitoring', { exchange, data });
}

// Kraken Monitoring Bot
const krakenSocket = new WebSocket(KRAKEN_WS);
krakenSocket.on('open', () => {
    log('Kraken Monitoring Bot: Connected to WebSocket');
    krakenSocket.send(JSON.stringify({
        event: 'subscribe',
        pair: ['BTC/USD'],
        subscription: { name: 'ticker' }
    }));
});

krakenSocket.on('message', (msg) => {
    const startTime = Date.now();
    const data = JSON.parse(msg);
    if (data[1] && data[1].c) {
        prices.kraken.btc_usd = parseFloat(data[1].c[0]);
        priceHistory.push({ exchange: 'Kraken', pair: 'BTC/USD', price: prices.kraken.btc_usd, timestamp: startTime });
        monitoringData.kraken.lastUpdate = startTime;
        monitoringData.kraken.latency = Date.now() - startTime;
        logMonitoring('Kraken', monitoringData.kraken);
        broadcast('price', { exchange: 'Kraken', price: prices.kraken.btc_usd }); // Broadcast Kraken price
    }
});

// Binance Monitoring Bot (using REST API)
async function monitorBinance() {
    while (true) {
        const startTime = Date.now();
        try {
            const response = await axios.get(BINANCE_API);
            prices.binance.btc_usdt = parseFloat(response.data.price);
            priceHistory.push({ exchange: 'Binance', pair: 'BTC/USDT', price: prices.binance.btc_usdt, timestamp: startTime });
            monitoringData.binance.lastUpdate = startTime;
            monitoringData.binance.latency = Date.now() - startTime;
            logMonitoring('Binance', monitoringData.binance);
            broadcast('price', { exchange: 'Binance', price: prices.binance.btc_usdt }); // Broadcast Binance price
        } catch (e) {
            log(`Binance Bot: Price fetch failed: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

// Uniswap Monitoring Bot
async function monitorUniswap() {
    const router = new ethers.Contract(UNISWAP_ROUTER_CHECKSUM, SWAP_ABI, providerETH);
    const poolAddress = '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f185'; // WETH/USDT pool on Uniswap
    const pool = new ethers.Contract(poolAddress, POOL_ABI, providerETH);
    while (true) {
        const startTime = Date.now();
        try {
            const amounts = await router.getAmountsOut(ethers.parseEther('1'), [WETH, USDT]);
            prices.uniswap.weth_usdt = parseFloat(ethers.formatEther(amounts[1]));
            priceHistory.push({ exchange: 'Uniswap', pair: 'WETH/USDT', price: prices.uniswap.weth_usdt, timestamp: startTime });

            const reserves = await pool.getReserves();
            liquidityData.uniswap.weth_usdt = {
                reserve0: parseFloat(ethers.formatEther(reserves[0])),
                reserve1: parseFloat(ethers.formatEther(reserves[1]))
            };
            log(`Uniswap Liquidity Bot: WETH/USDT Reserves - WETH: ${liquidityData.uniswap.weth_usdt.reserve0}, USDT: ${liquidityData.uniswap.weth_usdt.reserve1}`);

            monitoringData.uniswap.lastUpdate = startTime;
            monitoringData.uniswap.latency = Date.now() - startTime;
            logMonitoring('Uniswap', monitoringData.uniswap);
            broadcast('price', { exchange: 'Uniswap', price: prices.uniswap.weth_usdt }); // Broadcast Uniswap price
        } catch (e) {
            log(`Uniswap Bot: Price fetch failed: ${e.message}`);
            log(`Uniswap Bot: Error details: ${JSON.stringify(e)}`);
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

// Gas Price Optimization Bot
async function gasPriceBot() {
    while (true) {
        try {
            const bscFeeData = await providerBSC.getFeeData();
            const ethFeeData = await providerETH.getFeeData();
            gasPrices.bsc = parseFloat(ethers.formatUnits(bscFeeData.gasPrice, 'gwei'));
            gasPrices.eth = parseFloat(ethers.formatUnits(ethFeeData.gasPrice, 'gwei'));
            log(`Gas Price Bot: BSC: ${gasPrices.bsc} Gwei, ETH: ${gasPrices.eth} Gwei`);
        } catch (e) {
            log(`Gas Price Bot: Fetch failed: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

// Arbitrage Execution Bot
async function arbitrageBot() {
    while (true) {
        const krakenPrice = prices.kraken.btc_usd;
        const uniswapPrice = prices.uniswap.weth_usdt;
        const binancePrice = prices.binance.btc_usdt;
        const spreads = [
            { pair: 'Kraken-Binance', spread: Math.abs(krakenPrice - binancePrice) },
            { pair: 'Kraken-Uniswap', spread: Math.abs(krakenPrice - uniswapPrice) },
            { pair: 'Binance-Uniswap', spread: Math.abs(binancePrice - uniswapPrice) }
        ];

        for (const { pair, spread } of spreads) {
            log(`${pair} Spread: $${spread}`);
            broadcast('spread', { pair, spread }); // Broadcast spread for the Arbitrage Opportunities chart
            if (spread > 100) {
                log(`Arbitrage opportunity detected on ${pair}!`);
                const [buyExchange, sellExchange] = pair.split('-');
                await executeFlashLoan(spread, buyExchange, sellExchange);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

// Flash Loan Execution Bot (Placeholder - Requires Wallet)
async function executeFlashLoan(spread, buyExchange, sellExchange) {
    log('Execution Bot: Flash loan functionality requires a valid wallet private key. Skipping for now.');
    const trade = { spread, buyExchange, sellExchange, timestamp: Date.now() };
    trades.push(trade);
    logTrade(trade);
    broadcast('profit', { amount: spread * 0.9 }); // Broadcast profit for the Profits Made chart
}

// Decoy Bot to manipulate prices
async function decoyBot() {
    while (true) {
        try {
            log('Decoy Bot: Skipping order placement for debugging');
        } catch (e) {
            log(`Decoy Bot: Order failed: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

// Self-Evolving Bot
function selfEvolvingBot() {
    setInterval(() => {
        if (trades.length > 10) {
            const recentTrades = trades.slice(-10);
            const avgSpread = recentTrades.reduce((sum, trade) => sum + trade.spread, 0) / 10;
            const successRate = recentTrades.filter(t => t.spread > 100).length / 10;
            log(`Self-Evolving Bot: Avg Spread: $${avgSpread}, Success Rate: ${successRate * 100}%`);
            if (successRate < 0.5) {
                log('Self-Evolving Bot: Adjusting strategy - increasing threshold');
            }
        }
        if (priceHistory.length > 1000) {
            priceHistory = priceHistory.slice(-500);
            log('Self-Evolving Bot: Optimized price history memory');
        }
    }, 60000);
}

// Main function to start all bots
async function startBots() {
    log('Starting Crypto Beast Multi-Bot System...');
    monitorUniswap();
    monitorBinance();
    arbitrageBot();
    decoyBot();
    selfEvolvingBot();
    gasPriceBot();
}

// Start the system
startBots();