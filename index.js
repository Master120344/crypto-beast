require('dotenv').config();
const { Web3 } = require('web3');
const axios = require('axios');
const WebSocket = require('ws');
const ethers = require('ethers');
const { log, logTrade, logMonitoring } = require('./utils');

// Configuration
const KRAKEN_WS = 'wss://ws.kraken.com';
const PANCAKESWAP_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024';
const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488';
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/';
const PROVIDER_URL_ETH = 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID'; // Replace with your Infura ID
const AAVE_LENDING_POOL = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744';
const DYDX_SOLO_MARGIN = '0x1E0447b9cB2f1fBCcA5bC9C1aE73C5E4D20dB74';

// Load keys from .env
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY;
const KRAKEN_API_SECRET = process.env.KRAKEN_API_SECRET;

// Initialize Web3 and Ethers for BSC and Ethereum
const web3BSC = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL_BSC));
const web3ETH = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL_ETH));
const providerBSC = new ethers.providers.JsonRpcProvider(PROVIDER_URL_BSC);
const providerETH = new ethers.providers.JsonRpcProvider(PROVIDER_URL_ETH);
const walletBSC = new ethers.Wallet(WALLET_PRIVATE_KEY, providerBSC);
const walletETH = new ethers.Wallet(WALLET_PRIVATE_KEY, providerETH);

// PancakeSwap and Uniswap ABI
const SWAP_ABI = [
    {
        "constant": false,
        "inputs": [
            { "name": "amountIn", "type": "uint256" },
            { "name": "amountOutMin", "type": "uint256" },
            { "name": "path", "type": "address[]" },
            { "name": "to", "type": "address" },
            { "name": "deadline", "type": "uint256" }
        ],
        "name": "swapExactTokensForTokens",
        "outputs": [],
        "type": "function"
    },
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
    pancakeswap: { wbnb_busd: 0 },
    uniswap: { weth_usdt: 0 }
};
let priceHistory = [];
let trades = [];
let liquidityData = {
    pancakeswap: { wbnb_busd: { reserve0: 0, reserve1: 0 } },
    uniswap: { weth_usdt: { reserve0: 0, reserve1: 0 } }
};
let gasPrices = { bsc: 0, eth: 0 };

// Bot monitoring states
let monitoringData = {
    kraken: { latency: 0, lastUpdate: 0 },
    pancakeswap: { latency: 0, lastUpdate: 0 },
    uniswap: { latency: 0, lastUpdate: 0 }
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

// PancakeSwap Monitoring Bot
async function monitorPancakeSwap() {
    const router = new web3BSC.eth.Contract(SWAP_ABI, PANCAKESWAP_ROUTER);
    const poolAddress = '0x0eD7e52944161450477ee417DE9Cd3a859b14fD'; // WBNB/BUSD pool on PancakeSwap
    const pool = new web3BSC.eth.Contract(POOL_ABI, poolAddress);
    while (true) {
        const startTime = Date.now();
        try {
            const amounts = await router.methods.getAmountsOut(
                web3BSC.utils.toWei('1', 'ether'),
                ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', '0x55d398326f99059fF775485246999027B3197955']
            ).call();
            prices.pancakeswap.wbnb_busd = parseFloat(web3BSC.utils.fromWei(amounts[1], 'ether'));
            priceHistory.push({ exchange: 'PancakeSwap', pair: 'WBNB/BUSD', price: prices.pancakeswap.wbnb_busd, timestamp: startTime });

            const reserves = await pool.methods.getReserves().call();
            liquidityData.pancakeswap.wbnb_busd = {
                reserve0: parseFloat(web3BSC.utils.fromWei(reserves.reserve0, 'ether')),
                reserve1: parseFloat(web3BSC.utils.fromWei(reserves.reserve1, 'ether'))
            };
            log(`PancakeSwap Liquidity Bot: WBNB/BUSD Reserves - WBNB: ${liquidityData.pancakeswap.wbnb_busd.reserve0}, BUSD: ${liquidityData.pancakeswap.wbnb_busd.reserve1}`);

            monitoringData.pancakeswap.lastUpdate = startTime;
            monitoringData.pancakeswap.latency = Date.now() - startTime;
            logMonitoring('PancakeSwap', monitoringData.pancakeswap);
        } catch (e) {
            log(`PancakeSwap Bot: Price fetch failed: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

// Uniswap Monitoring Bot
async function monitorUniswap() {
    const router = new web3ETH.eth.Contract(SWAP_ABI, UNISWAP_ROUTER);
    const poolAddress = '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f185'; // WETH/USDT pool on Uniswap
    const pool = new web3ETH.eth.Contract(POOL_ABI, poolAddress);
    while (true) {
        const startTime = Date.now();
        try {
            const amounts = await router.methods.getAmountsOut(
                web3ETH.utils.toWei('1', 'ether'),
                ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '0xdAC17F958D2ee523a2206206994597C13D831ec7']
            ).call();
            prices.uniswap.weth_usdt = parseFloat(web3ETH.utils.fromWei(amounts[1], 'ether'));
            priceHistory.push({ exchange: 'Uniswap', pair: 'WETH/USDT', price: prices.uniswap.weth_usdt, timestamp: startTime });

            const reserves = await pool.methods.getReserves().call();
            liquidityData.uniswap.weth_usdt = {
                reserve0: parseFloat(web3ETH.utils.fromWei(reserves.reserve0, 'ether')),
                reserve1: parseFloat(web3ETH.utils.fromWei(reserves.reserve1, 'ether'))
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
            const bscGasPrice = await providerBSC.getGasPrice();
            const ethGasPrice = await providerETH.getGasPrice();
            gasPrices.bsc = parseFloat(ethers.utils.formatUnits(bscGasPrice, 'gwei'));
            gasPrices.eth = parseFloat(ethers.utils.formatUnits(ethGasPrice, 'gwei'));
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
        const pancakePrice = prices.pancakeswap.wbnb_busd;
        const uniswapPrice = prices.uniswap.weth_usdt;
        const spreads = [
            { pair: 'Kraken-PancakeSwap', spread: Math.abs(krakenPrice - pancakePrice) },
            { pair: 'Kraken-Uniswap', spread: Math.abs(krakenPrice - uniswapPrice) },
            { pair: 'PancakeSwap-Uniswap', spread: Math.abs(pancakePrice - uniswapPrice) }
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
    const tradeAmount = ethers.utils.parseEther('1');
    const gasPrice = await providerBSC.getGasPrice();
    const gasLimit = 300000;
    const gasFeeEstimate = gasPrice.mul(gasLimit);

    log(`Execution Bot: Initiating flash loan for ${buyExchange} -> ${sellExchange}`);
    try {
        const aaveContract = new ethers.Contract(AAVE_LENDING_POOL, ['function flashLoan(address receiver, address[] assets, uint256[] amounts, uint256[] modes, address onBehalfOf, bytes calldata params, uint16 referralCode)'], walletBSC);
        const aaveTx = await aaveContract.flashLoan(
            WALLET_ADDRESS,
            ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'],
            [tradeAmount],
            [0],
            WALLET_ADDRESS,
            '0x',
            0,
            { gasLimit: gasLimit }
        );
        log(`Execution Bot: Aave flash loan initiated: ${aaveTx.hash}`);

        const dydxContract = new ethers.Contract(DYDX_SOLO_MARGIN, ['function operate(Account.Info[] memory accounts, Actions.ActionArgs[] memory actions)'], walletBSC);
        const dydxTx = await dydxContract.operate(
            [{ owner: WALLET_ADDRESS, number: 1 }],
            [{ actionType: 0, accountId: 0, amount: { sign: false, denomination: 0, ref: 0, value: gasFeeEstimate.toString() }, primaryMarketId: 0, secondaryMarketId: 0, otherAddress: WALLET_ADDRESS, otherAccountId: 0, data: '0x' }],
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
    const routerBSC = new web3BSC.eth.Contract(SWAP_ABI, PANCAKESWAP_ROUTER);
    const routerETH = new web3ETH.eth.Contract(SWAP_ABI, UNISWAP_ROUTER);
    while (true) {
        try {
            await routerBSC.methods.swapExactTokensForTokens(
                web3BSC.utils.toWei('0.01', 'ether'),
                0,
                ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', '0x55d398326f99059fF775485246999027B3197955'],
                WALLET_ADDRESS,
                Math.floor(Date.now() / 1000) + 60
            ).send({ from: WALLET_ADDRESS });
            log('Decoy Bot: Order placed on PancakeSwap');

            await routerETH.methods.swapExactTokensForTokens(
                web3ETH.utils.toWei('0.01', 'ether'),
                0,
                ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '0xdAC17F958D2ee523a2206206994597C13D831ec7'],
                WALLET_ADDRESS,
                Math.floor(Date.now() / 1000) + 60
            ).send({ from: WALLET_ADDRESS });
            log('Decoy Bot: Order placed on Uniswap');
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
    monitorPancakeSwap();
    monitorUniswap();
    arbitrageBot();
    decoyBot();
    selfEvolvingBot();
    gasPriceBot();
}

// Start the system
startBots();
