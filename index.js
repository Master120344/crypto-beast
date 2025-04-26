require('dotenv').config();
const Web3 = require('web3');
const axios = require('axios');
const WebSocket = require('ws');
const ethers = require('ethers');

// Configuration
const KRAKEN_WS = 'wss://ws.kraken.com';
const PANCAKESWAP_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024';
const PROVIDER_URL = 'https://bsc-dataseed.binance.org/';
const AAVE_LENDING_POOL = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744'; // Aave on BSC
const DYDX_SOLO_MARGIN = '0x1E0447b9cB2f1fBCcA5bC9C1aE73C5E4D20dB74'; // dYdX on BSC (placeholder)

// Load keys from .env
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY;
const KRAKEN_API_SECRET = process.env.KRAKEN_API_SECRET;

// Initialize Web3 and Ethers
const web3 = new Web3(PROVIDER_URL);
const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

// PancakeSwap ABI (simplified for swaps)
const PANCAKESWAP_ABI = [
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
    }
];

// Price tracking
let krakenPrice = 0;
let pancakePrice = 0;
let priceHistory = [];
let trades = [];

// Kraken WebSocket for real-time prices
const krakenSocket = new WebSocket(KRAKEN_WS);
krakenSocket.on('open', () => {
    console.log('Connected to Kraken WebSocket');
    krakenSocket.send(JSON.stringify({
        event: 'subscribe',
        pair: ['BTC/USD'],
        subscription: { name: 'ticker' }
    }));
});

krakenSocket.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data[1] && data[1].c) {
        krakenPrice = parseFloat(data[1].c[0]);
        priceHistory.push({ exchange: 'Kraken', price: krakenPrice, timestamp: Date.now() });
        console.log(`Kraken BTC/USD: $${krakenPrice}`);
        checkArbitrage();
    }
});

// PancakeSwap price fetch
async function getPancakePrice() {
    const router = new web3.eth.Contract(PANCAKESWAP_ABI, PANCAKESWAP_ROUTER);
    try {
        const amounts = await router.methods.swapExactTokensForTokens(
            web3.utils.toWei('1', 'ether'),
            0,
            ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', '0x55d398326f99059fF775485246999027B3197955'], // WBNB -> BUSD
            WALLET_ADDRESS,
            Math.floor(Date.now() / 1000) + 60
        ).call();
        pancakePrice = parseFloat(web3.utils.fromWei(amounts[1], 'ether'));
        priceHistory.push({ exchange: 'PancakeSwap', price: pancakePrice, timestamp: Date.now() });
        console.log(`PancakeSwap WBNB/BUSD: $${pancakePrice}`);
    } catch (e) {
        console.error('PancakeSwap price fetch failed:', e.message);
    }
}

// Arbitrage logic
async function checkArbitrage() {
    await getPancakePrice();
    const spread = Math.abs(krakenPrice - pancakePrice);
    console.log(`Spread: $${spread}`);

    if (spread > 100) { // Threshold for profitability
        console.log('Arbitrage opportunity detected!');
        const buyExchange = krakenPrice < pancakePrice ? 'Kraken' : 'PancakeSwap';
        const sellExchange = krakenPrice < pancakePrice ? 'PancakeSwap' : 'Kraken';
        await executeFlashLoan(spread, buyExchange, sellExchange);
    }
}

// Flash loan execution (Aave for trade, dYdX for gas)
async function executeFlashLoan(spread, buyExchange, sellExchange) {
    const tradeAmount = ethers.utils.parseEther('1'); // 1 WBNB
    const gasPrice = await provider.getGasPrice();
    const gasLimit = 300000;
    const gasFeeEstimate = gasPrice.mul(gasLimit);

    console.log(`Initiating flash loan for ${buyExchange} -> ${sellExchange}`);
    try {
        // Aave flash loan for trade
        const aaveContract = new ethers.Contract(AAVE_LENDING_POOL, ['function flashLoan(address receiver, address[] assets, uint256[] amounts, uint256[] modes, address onBehalfOf, bytes calldata params, uint16 referralCode)'], wallet);
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
        console.log('Aave flash loan initiated:', aaveTx.hash);

        // dYdX flash loan for gas (simplified)
        const dydxContract = new ethers.Contract(DYDX_SOLO_MARGIN, ['function operate(Account.Info[] memory accounts, Actions.ActionArgs[] memory actions)'], wallet);
        const dydxTx = await dydxContract.operate(
            [{ owner: WALLET_ADDRESS, number: 1 }],
            [{ actionType: 0, accountId: 0, amount: { sign: false, denomination: 0, ref: 0, value: gasFeeEstimate.toString() }, primaryMarketId: 0, secondaryMarketId: 0, otherAddress: WALLET_ADDRESS, otherAccountId: 0, data: '0x' }],
            { gasLimit: 100000 }
        );
        console.log('dYdX flash loan for gas initiated:', dydxTx.hash);

        // Simulate trade (buy low, sell high)
        trades.push({ spread, buyExchange, sellExchange, timestamp: Date.now() });
    } catch (e) {
        console.error('Flash loan failed:', e.message);
    }
}

// Decoy bot to manipulate PancakeSwap prices
async function deployDecoyOrders() {
    const router = new web3.eth.Contract(PANCAKESWAP_ABI, PANCAKESWAP_ROUTER);
    try {
        for (let i = 0; i < 3; i++) {
            await router.methods.swapExactTokensForTokens(
                web3.utils.toWei('0.01', 'ether'),
                0,
                ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', '0x55d398326f99059fF775485246999027B3197955'],
                WALLET_ADDRESS,
                Math.floor(Date.now() / 1000) + 60
            ).send({ from: WALLET_ADDRESS });
            console.log('Decoy order placed on PancakeSwap');
        }
    } catch (e) {
        console.error('Decoy order failed:', e.message);
    }
}

// Self-evolving logic (basic: adjust threshold based on past trades)
function adjustThreshold() {
    if (trades.length > 5) {
        const avgSpread = trades.slice(-5).reduce((sum, trade) => sum + trade.spread, 0) / 5;
        console.log(`Adjusting threshold based on average spread: $${avgSpread}`);
        return avgSpread * 0.9; // Lower threshold slightly to catch more opportunities
    }
    return 100; // Default threshold
}

// Main bot loop
async function startBot() {
    console.log('Crypto Beast Bot Starting...');
    setInterval(async () => {
        await checkArbitrage();
        await deployDecoyOrders();
        const newThreshold = adjustThreshold();
        console.log(`New arbitrage threshold: $${newThreshold}`);
    }, 10000); // Run every 10 seconds
}

// Start the bot
startBot();
