// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract PythTest {
    bytes32 public priceId;
    IPyth public pyth;

    event ParsePriceFeedUpdates(int64 price, uint256 publishTime);
    event NewPrice(bytes updata, uint64 fixDate);

    constructor(address _contractAddress, bytes32 _priceId) {
        pyth = IPyth(_contractAddress);
        priceId = _priceId;
    }

    function parsePriceFeedUpdates(
        bytes memory _pythUpdateData,
        uint64 _fixedDate
    ) external payable returns (int64, uint256) {
        bytes32[] memory priceIds = new bytes32[](1);
        bytes[] memory pythData = new bytes[](1);
        priceIds[0] = priceId;
        pythData[0] = _pythUpdateData;

        uint256 fee = pyth.getUpdateFee(pythData);
        pyth.updatePriceFeeds{value: fee}(pythData);
        PythStructs.PriceFeed memory pythPrice = pyth.parsePriceFeedUpdates{value: fee}(
            pythData,
            priceIds,
            _fixedDate,
            _fixedDate+5
        )[0];
        return (pyth.getPrice(priceId).price, fee);

        // emit ParsePriceFeedUpdates(
        //     pyth.getPrice(priceId).price,
        //     pyth.getPrice(priceId).publishTime
        // );
        // emit NewPrice(_pythUpdateData, _fixedDate);
        // return (
        //     pyth.getPrice(priceId).price,
        //     pyth.getPrice(priceId).publishTime
        // );
    }

    function setPythContract(address _contractAddress) external {
        pyth = IPyth(_contractAddress);
    }

    function setPriceId(bytes32 _priceId) external {
        priceId = _priceId;
    }
}
