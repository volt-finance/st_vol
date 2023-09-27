// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./StVol.sol";

/**
 * @title StVol1PerUp
 */
contract StVol1PerUp is StVol {
    constructor(
        address _token,
        address _oracleAddress,
        address _adminAddress,
        address _operatorAddress,
        address _participantVaultAddress,
        uint256 _commissionfee,
        uint256 _operateRate,
        uint256 _participantRate,
        bytes32 _priceId
    ) 
    StVol(
        _token,
        _oracleAddress,
        _adminAddress,
        _operatorAddress,
        _participantVaultAddress,
        _commissionfee,
        _operateRate,
        _participantRate,
        100, // 100: 1%
        StVol.StrategyType.Up,
        _priceId
    ) {}

}
