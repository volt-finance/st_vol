// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract PythTest {
  IPyth pyth;
  bytes32 public priceId;

  constructor(address pythContract, bytes32 _priceId) {
    pyth = IPyth(pythContract);
    priceId = _priceId;
  }

  function getEthUsdPrice(
    bytes[] calldata priceUpdateData
  ) public payable returns (PythStructs.Price memory) {
    // Update the prices to the latest available values and pay the required fee for it. The `priceUpdateData` data
    // should be retrieved from our off-chain Price Service API using the `pyth-evm-js` package.
    // See section "How Pyth Works on EVM Chains" below for more information.
    uint fee = pyth.getUpdateFee(priceUpdateData);
    pyth.updatePriceFeeds{ value: fee }(priceUpdateData);
    return pyth.getPrice(priceId);
  }

    /**
     * @notice Set price ID
     * @dev Callable by owner
     */
    function setPriceId(bytes32 _priceId) public {
        priceId = _priceId;
    }
}