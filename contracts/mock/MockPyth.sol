pragma solidity ^0.8.0;

import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

contract MockPyth {
    uint256 public updateFee;

    PythStructs.Price public price;

    function setUpdateFee(uint256 _updateFee) external {
        updateFee = _updateFee;
    }

    function getUpdateFee(bytes[] calldata) external view returns(uint256) {
        return updateFee;
    }

    function parsePriceFeedUpdates(
        bytes[] calldata,
        bytes32[] calldata,
        uint64,
        uint64
    ) external payable returns (PythStructs.PriceFeed[] memory feed) {
    }

    function updatePriceFeeds(
        bytes[] calldata
    ) external payable {
    }

    function setPrice(int64 p, uint64 conf, int32 expo, uint256 publishTime) external {
        price = PythStructs.Price(p, conf, expo, publishTime);
    }

    function getPrice(bytes32) external view returns(PythStructs.Price memory) {
        return price;
    }
}
