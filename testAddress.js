const { ethers } = require('ethers');

try {
  const BTCB = ethers.utils.getAddress('0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9');
  console.log('Checksummed BTCB Address:', BTCB);
} catch (error) {
  console.error('Error:', error);
}
