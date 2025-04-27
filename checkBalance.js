const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.ninicoin.io/'); // Alternative provider
const address = '0xA8f5C1b1eB26e5bF93D6dC7f637a34dC2F452A9';

async function checkBalance() {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
        try {
            const balance = await provider.getBalance(address.toLowerCase());
            console.log('Balance:', ethers.formatEther(balance), 'BNB');
            return; // Exit on success
        } catch (error) {
            attempts++;
            console.error(`Attempt ${attempts} failed:`, error.message);
            if (attempts === maxAttempts) {
                console.error('Max attempts reached. Could not fetch balance.');
            } else {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
            }
        }
    }
}

checkBalance();
