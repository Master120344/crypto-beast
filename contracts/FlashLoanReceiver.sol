// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

contract FlashLoanReceiver is FlashLoanSimpleReceiverBase {
    address public owner;
    address public constant PANCAKESWAP_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024;
    address public constant BTCB = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9;
    address public constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    constructor(address _addressProvider) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) {
        owner = msg.sender;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(asset == BTCB, "Asset must be BTCB");
        require(initiator == address(this), "Invalid initiator");

        // Swap BTCB for WBNB on PancakeSwap
        IERC20(BTCB).approve(PANCAKESWAP_ROUTER, amount);
        address[] memory path = new address[](2);
        path[0] = BTCB;
        path[1] = WBNB;

        (bool success, ) = PANCAKESWAP_ROUTER.call(
            abi.encodeWithSignature(
                "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
                amount,
                0, // Minimum amount out (should be calculated in production)
                path,
                address(this),
                block.timestamp + 300
            )
        );
        require(success, "Swap failed");

        // Repay the flash loan (amount + premium)
        uint256 amountOwing = amount + premium;
        IERC20(BTCB).approve(address(POOL), amountOwing);

        return true;
    }

    receive() external payable {}
}
