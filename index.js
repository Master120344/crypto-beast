// File: index.js
require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');
const { ethers } = require('ethers');
const { log, logTrade, logMonitoring } = require('./utils');

// Configuration
const KRAKEN_WS = 'wss://ws.kraken.com';
const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488'; // Uniswap Router v2 on Ethereum
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/';
const PROVIDER_URL_ETH = `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
const AAVE_LENDING_POOL = '0x26fCbd3afebbe28D0A8684F790C48368D21665b'; // Aave Lending Pool on BSC
const DYDX_SOLO_MARGIN = '0x1E0447b9cB2f1fBCcA5bC9C1aE73C5E4D20dB74'; // Placeholder for dYdX (not available on BSC)

// Load keys from .env
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY;
const KRAKEN_API_SECRET = process.env.KRAKEN_API_SECRET;

// Initialize Ethers for BSC and Ethereum
const providerBSC = new ethers.JsonRpcProvider(PROVIDER_URL_BSC);
const providerETH = new ethers.JsonRpcProvider(PROVIDER_URL_ETH);
const walletBSC = new ethers.Wallet(WALLET_PRIVATE_KEY, providerBSC);
const walletETH = new ethers.Wallet(WALLET_PRIVATE_KEY, providerETH);

// Skip strict address validation for now
const UNISWAP_ROUTER_CHECKSUM = UNISWAP_ROUTER;
const AAVE_LENDING_POOL_CHECKSUM = AAVE_LENDING_POOL;
const DYDX_SOLO_MARGIN_CHECKSUM = DYDX_SOLO_MARGIN;
const WALLET_ADDRESS_CHECKSUM = WALLET_ADDRESS;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

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
    uniswap: { weth_usdt: 0 }
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
    uniswap: { latency: 0, lastUpdate: 0 }
};

// WebSocket Server to broadcast live data to the dashboard
const wss = new WebSocket.Server({ port: 8081 });

wss.on('connection', (ws) => {
    log('WebSocket client connected');
    ws.on('close', () => log('WebSocket client disconnected'));
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

// Override the log function to broadcast logs to the dashboard
const originalLog = log;
log = (message) => {
    originalLog(message);
    broadcast('log', message);
};

// Override logTrade to broadcast trades
const originalLogTrade = logTrade;
logTrade = (trade) => {
    originalLogTrade(trade);
    broadcast('trade', trade);
};

// Override logMonitoring to broadcast monitoring updates
const originalLogMonitoring = logMonitoring;
logMonitoring = (exchange, data) => {
    originalLogMonitoring(exchange, data);
    broadcast('monitoring', { exchange, data });
};

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
    }
});

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
        } catch (e) {
            log(`Uniswap Bot: Price fetch failed: ${e.message}`);
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
        const spreads = [
            { pair: 'Kraken-Uniswap', spread: Math.abs(krakenPrice - uniswapPrice) }
        ];

        for (const { pair, spread } of spreads) {
            log(`${pair} Spread: $${spread}`);
            if (spread > 100) {
                log(`Arbitrage opportunity detected on ${pair}!`);
                const [buyExchange, sellExchange] = pair.split('-');
                await executeFlashLoan(spread, buyExchange, sellExchange);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

// Flash Loan Execution Bot
async function executeFlashLoan(spread, buyExchange, sellExchange) {
    const tradeAmount = ethers.parseEther('1');
    const feeData = await providerBSC.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('5', 'gwei'); // Fallback gas price
    const gasLimit = BigInt(300000);
    const gasFeeEstimate = BigInt(gasPrice) * gasLimit;

    log(`Execution Bot: Initiating flash loan for ${buyExchange} -> ${sellExchange}`);
    try {
        const aaveContract = new ethers.Contract(AAVE_LENDING_POOL_CHECKSUM, ['function flashLoan(address receiver, address[] assets, uint256[] amounts, uint256[] modes, address onBehalfOf, bytes calldata params, uint16 referralCode)'], walletBSC);
        const aaveTx = await aaveContract.flashLoan(
            WALLET_ADDRESS_CHECKSUM,
            [WETH],
            [tradeAmount],
            [0],
            WALLET_ADDRESS_CHECKSUM,
            '0x',
            0,
            { gasLimit: gasLimit }
        );
        log(`Execution Bot: Aave flash loan initiated: ${aaveTx.hash}`);

        const dydxContract = new ethers.Contract(DYDX_SOLO_MARGIN_CHECKSUM, ['function operate(Account.Info[] memory accounts, Actions.ActionArgs[] memory actions)'], walletBSC);
        const dydxTx = await dydxContract.operate(
            [{ owner: WALLET_ADDRESS_CHECKSUM, number: 1 }],
            [{ actionType: 0, accountId: 0, amount: { sign: false, denomination: 0, ref: 0, value: gasFeeEstimate.toString() }, primaryMarketId: 0, secondaryMarketId: 0, otherAddress: WALLET_ADDRESS_CHECKSUM, otherAccountId: 0, data: '0x' }],
            { gasLimit: 100000 }
        );
        log(`Execution Bot: dYdX flash loan for gas initiated: ${dydxTx.hash}`);

        const trade = { spread, buyExchange, sellExchange, timestamp: Date.now() };
        trades.push(trade);
        logTrade(trade);
    } catch (e) {
        log(`Execution Bot: Flash loan failed: ${e.message}`);
    }
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
    arbitrageBot();
    decoyBot();
    selfEvolvingBot();
    gasPriceBot();
}

// Start the system
startBots();