// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract PythTest {
  IPyth pyth;

  constructor(address pythContract) {
    pyth = IPyth(pythContract);
  }

  function getBtcUsdPrice(
    bytes[] calldata priceUpdateData
  ) public payable returns (PythStructs.Price memory) {
    // Update the prices to the latest available values and pay the required fee for it. The `priceUpdateData` data
    // should be retrieved from our off-chain Price Service API using the `pyth-evm-js` package.
    // See section "How Pyth Works on EVM Chains" below for more information.
    uint fee = pyth.getUpdateFee(priceUpdateData);
    pyth.updatePriceFeeds{ value: fee }(priceUpdateData);

    bytes32 priceID = 0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b;
    // Read the current value of priceID, aborting the transaction if the price has not been updated recently.
    // Every chain has a default recency threshold which can be retrieved by calling the getValidTimePeriod() function on the contract.
    // Please see IPyth.sol for variants of this function that support configurable recency thresholds and other useful features.
    return pyth.getPrice(priceID);
  }
}