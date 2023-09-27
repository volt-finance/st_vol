// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./StVol.sol";

/**
 * @title StVolUpDown
 */
contract StVolUpDown is StVol {
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
        0, // 0
        StVol.StrategyType.None, // None: Up & Down
        _priceId
    ) {}

}
