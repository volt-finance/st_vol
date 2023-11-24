// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
/**
 * E01: Not admin
 * E02: Not operator
 * E03: Contract not allowed
 * E04: Commission fee too high
 * E05: Strategy Type must be Up or Down
 * E06: Strategy Type must be None
 * E07: Participate is too early/late
 * E08: Round not participable
 * E09: Participate amount must be greater than minParticipateAmount
 * E10: Round has not started
 * E11: Round has not ended
 * E12: Not eligible for claim
 * E13: Not eligible for refund
 * E14: Can only run after genesisOpenRound and genesisStartRound is triggered
 * E15: Pyth Oracle non increasing publishTimes
 * E16: Can only run after genesisOpenRound is triggered
 * E17: Can only open round after round n-2 has ended
 * E18: Can only open new round after round n-2 closeTimestamp
 * E19: Can only open new round after init date
 * E20: Participate payout must be greater than zero
 * E21: Can only cancel order after round has started
 * E22: Can only cancel order before startTimestamp
 * E23: Can only lock round after round has started
 * E24: Can only start round after startTimestamp
 * E25: Can only start round within bufferSeconds
 * E26: Can only end round after round has locked
 * E27: Can only end round after closeTimestamp
 * E28: Can only end round within bufferSeconds
 * E29: Rewards calculated
 * E30: bufferSeconds must be inferior to intervalSeconds
 * E31: Cannot be zero address
 * E32: Can only run genesisStartRound once
 * E33: Pyth Oracle non increasing publishTimes
 */

contract StVol is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token; // Prediction token

    IPyth public oracle;

    bool public genesisOpenOnce = false;
    bool public genesisStartOnce = false;

    bytes32 public priceId; // address of the pyth price
    address public adminAddress; // address of the admin
    address public operatorAddress; // address of the operator
    address public operatorVaultAddress; // address of the operator vault

    uint256 public bufferSeconds; // number of seconds for valid execution of a participate round
    uint256 public intervalSeconds; // interval in seconds between two participate rounds

    uint256 public commissionfee; // commission rate (e.g. 200 = 2%, 150 = 1.50%)
    uint256 public treasuryAmount; // treasury amount that was not claimed
    //uint256 public operateRate; // operate distribute rate (e.g. 200 = 2%, 150 = 1.50%) //@audit remove this value since it is no longer used
    uint256 public participantRate; // participant distribute rate (e.g. 200 = 2%, 150 = 1.50%)
    int256 public strategyRate; // strategy rate (e.g. 100 = 1%)
    StrategyType public strategyType; // strategy type
    uint256 public currentEpoch; // current epoch for round
    uint256 public constant BASE = 10000; // 100%
    uint256 public constant MAX_COMMISSION_FEE = 200; // 2%
    uint256 public constant DEFAULT_MIN_PARTICIPATE_AMOUNT = 1000000; // 1 USDC
    uint256 public constant DEFAULT_INTERVAL_SECONDS = 86400; // 24 * 60 * 60 * 1(1day)
    uint256 public constant DEFAULT_BUFFER_SECONDS = 600; // 60 * 10 (10min)
    uint256 public lastCommittedPublishTime; // time when the last committed update was published to Pyth

    struct LimitOrder {
        address user;
        uint256 payout;
        uint256 amount;
        uint256 blockTimestamp;
        LimitOrderStatus status;
    }

    enum LimitOrderStatus {
        Undeclared,
        Approve,
        Cancelled
    }

    mapping(uint256 => LimitOrder[]) public overLimitOrders;
    mapping(uint256 => LimitOrder[]) public underLimitOrders;
    mapping(uint256 => mapping(Position => mapping(address => ParticipateInfo))) public ledger;
    mapping(uint256 => Round) public rounds;
    mapping(address => uint256[]) public userRounds;

    enum Position {
        Over,
        Under
    }
    enum StrategyType {
        None,
        Up,
        Down
    }

    struct Round {
        uint256 epoch;
        uint256 openTimestamp;
        uint256 startTimestamp;
        uint256 closeTimestamp;
        int256 startPrice;
        int256 closePrice;
        uint256 startOracleId;
        uint256 closeOracleId;
        uint256 totalAmount;
        uint256 overAmount;
        uint256 underAmount;
        uint256 rewardBaseCalAmount;
        uint256 rewardAmount;
        bool oracleCalled;
    }

    struct ParticipateInfo {
        Position position;
        uint256 amount;
        bool claimed; // default false
    }

    struct RoundAmount {
        uint256 totalAmount;
        uint256 overAmount;
        uint256 underAmount;
    }

    event ParticipateUnder(address indexed sender, uint256 indexed epoch, uint256 amount);
    event ParticipateOver(address indexed sender, uint256 indexed epoch, uint256 amount);
    event ParticipateLimitOrder(
        address indexed sender,
        uint256 indexed epoch,
        uint256 amount,
        uint256 payout,
        uint256 placeTimestamp,
        Position position,
        LimitOrderStatus status
    );
    event Claim(address indexed sender, uint256 indexed epoch, Position position, uint256 amount);
    event EndRound(uint256 indexed epoch, int256 price);
    event StartRound(uint256 indexed epoch, int256 price);
    event RewardsCalculated(
        uint256 indexed epoch, uint256 rewardBaseCalAmount, uint256 rewardAmount, uint256 treasuryAmount
    );
    event OpenRound(uint256 indexed epoch, int256 strategyRate, StrategyType strategyType);

    modifier onlyAdmin() {
        require(msg.sender == adminAddress, "E01");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operatorAddress, "E02");
        _;
    }

    modifier notContract() {
        //require(!_isContract(msg.sender), "E03"); //@audit remove this
        require(msg.sender == tx.origin, "E03");
        _;
    }

    constructor(
        address _token,
        address _oracleAddress,
        address _adminAddress,
        address _operatorAddress,
        address _operatorVaultAddress,
        uint256 _commissionfee,
        //uint256 _operateRate,
        int256 _strategyRate,
        StrategyType _strategyType,
        bytes32 _priceId
    ) {
        require(_commissionfee <= MAX_COMMISSION_FEE, "E04");
        // @audit check startegyRate
        // @audit added require statement
        require(_strategyRate <= 10000 && _strategyRate >= -10000, "XX");
        if (_strategyRate > 0) {
            require(_strategyType != StrategyType.None, "E05");
        } else {
            require(_strategyType == StrategyType.None, "E06");
        }

        token = IERC20(_token);
        oracle = IPyth(_oracleAddress);
        adminAddress = _adminAddress;
        operatorAddress = _operatorAddress;
        operatorVaultAddress = _operatorVaultAddress;
        commissionfee = _commissionfee;
        //operateRate = _operateRate;
        strategyRate = _strategyRate;
        strategyType = _strategyType;
        priceId = _priceId;

        intervalSeconds = DEFAULT_INTERVAL_SECONDS;
        bufferSeconds = DEFAULT_BUFFER_SECONDS;
    }

    function participateUnder(uint256 epoch, uint256 _amount) external whenNotPaused nonReentrant notContract {
        require(epoch == currentEpoch, "E07");
        require(_participable(epoch), "E08");
        require(_amount >= DEFAULT_MIN_PARTICIPATE_AMOUNT, "E09");

        token.safeTransferFrom(msg.sender, address(this), _amount);
        _participate(epoch, Position.Under, msg.sender, _amount);
    }

    function participateOver(uint256 epoch, uint256 _amount) external whenNotPaused nonReentrant notContract {
        require(epoch == currentEpoch, "E07");
        require(_participable(epoch), "E08");
        require(_amount >= DEFAULT_MIN_PARTICIPATE_AMOUNT, "E09");

        token.safeTransferFrom(msg.sender, address(this), _amount);
        _participate(epoch, Position.Over, msg.sender, _amount);
    }

    function claim(uint256 epoch, Position position) external nonReentrant notContract {
        uint256 reward; // Initializes reward

        require(rounds[epoch].openTimestamp != 0, "E10");
        require(block.timestamp > rounds[epoch].closeTimestamp, "E11");

        uint256 addedReward = 0;
        // Round valid, claim rewards
        if (rounds[epoch].oracleCalled) {
            require(claimable(epoch, position, msg.sender), "E12");
            if (
                (rounds[epoch].overAmount > 0 && rounds[epoch].underAmount > 0)
                    && (rounds[epoch].startPrice != rounds[epoch].closePrice)
            ) {
                addedReward += (ledger[epoch][position][msg.sender].amount * rounds[epoch].rewardAmount)
                    / rounds[epoch].rewardBaseCalAmount;
            }
        } else {
            // Round invalid, refund Participate amount
            require(refundable(epoch, position, msg.sender), "E13");
        }
        ledger[epoch][position][msg.sender].claimed = true;
        reward = ledger[epoch][position][msg.sender].amount + addedReward;

        emit Claim(msg.sender, epoch, position, reward);

        if (reward > 0) {
            token.safeTransfer(msg.sender, reward);
        }
    }

    function claimAll() external nonReentrant notContract {
        _transferReward(msg.sender);
    }

    function redeemAll(address _user) external whenPaused onlyAdmin {
        _transferReward(_user);
    }

    function executeRound(bytes[] calldata priceUpdateData, uint64 initDate, bool isFixed)
        external
        payable
        whenNotPaused
        onlyOperator
    {
        require(genesisOpenOnce && genesisStartOnce, "E14");

        (int64 pythPrice, uint256 publishTime) = _getPythPrice(priceUpdateData, initDate, isFixed);
        //@audit should check if publishTime is within safe range
        require(publishTime > lastCommittedPublishTime, "E15");
        lastCommittedPublishTime = publishTime;

        // CurrentEpoch refers to previous round (n-1)
        _safeStartRound(currentEpoch, pythPrice);
        //_placeLimitOrders(currentEpoch);
        _safeEndRound(currentEpoch - 1, pythPrice);
        _calculateRewards(currentEpoch - 1);

        // Increment currentEpoch to current round (n)
        currentEpoch = currentEpoch + 1;
        _safeOpenRound(currentEpoch, initDate);
    }

    function _getPythPrice(
        bytes[] calldata priceUpdateData, //@audit memory => calldata
        uint64 fixedTimestamp,
        bool isFixed
    ) internal returns (int64, uint256) {
        bytes32[] memory pythPair = new bytes32[](1);
        pythPair[0] = priceId;

        uint256 fee = oracle.getUpdateFee(priceUpdateData);
        if (isFixed) {
            oracle.parsePriceFeedUpdates{value: fee}(priceUpdateData, pythPair, fixedTimestamp, fixedTimestamp + 10);
        } else {
            oracle.updatePriceFeeds{value: fee}(priceUpdateData);
        }
        return (oracle.getPrice(priceId).price, oracle.getPrice(priceId).publishTime);
    }

    function genesisStartRound(bytes[] calldata priceUpdateData, uint64 initDate, bool isFixed)
        external
        payable
        whenNotPaused
        onlyOperator
    {
        require(genesisOpenOnce, "E16");
        require(!genesisStartOnce, "E32");

        (int64 pythPrice, uint256 publishTime) = _getPythPrice(priceUpdateData, initDate, isFixed);
        //@audit should check if publishTime is within safe range
        require(publishTime > lastCommittedPublishTime, "E15");
        lastCommittedPublishTime = publishTime;

        _safeStartRound(currentEpoch, pythPrice);
        //_placeLimitOrders(currentEpoch);

        currentEpoch = currentEpoch + 1;
        _openRound(currentEpoch, initDate);
        genesisStartOnce = true;
    }

    function genesisOpenRound(uint256 initDate) external whenNotPaused onlyOperator {
        //@audit added
        require(genesisStartOnce, "");
        require(!genesisOpenOnce, "E33");

        currentEpoch = currentEpoch + 1;
        _openRound(currentEpoch, initDate);
        genesisOpenOnce = true;
    }

    function pause() external whenNotPaused onlyAdmin {
        _pause();
    }

    function claimTreasury() external nonReentrant onlyAdmin {
        uint256 currentTreasuryAmount = treasuryAmount;
        treasuryAmount = 0;

        // operator 100%
        token.safeTransfer(
            operatorVaultAddress,
            currentTreasuryAmount //@audit updated to not use operateRate
        );
    }

    function unpause() external whenPaused onlyAdmin {
        genesisOpenOnce = false;
        genesisStartOnce = false;
        _unpause();
    }

    function setBufferAndIntervalSeconds(uint256 _bufferSeconds, uint256 _intervalSeconds)
        external
        whenPaused
        onlyAdmin
    {
        require(_bufferSeconds < _intervalSeconds, "E30");
        bufferSeconds = _bufferSeconds;
        intervalSeconds = _intervalSeconds;
    }

    function setOperator(address _operatorAddress) external onlyAdmin {
        require(_operatorAddress != address(0), "E31");
        operatorAddress = _operatorAddress;
    }

    function setOperatorVault(address _operatorVaultAddress) external onlyAdmin {
        require(_operatorVaultAddress != address(0), "E31");
        operatorVaultAddress = _operatorVaultAddress;
    }

    function setOracle(address _oracle) external whenPaused onlyAdmin {
        require(_oracle != address(0), "E31");
        oracle = IPyth(_oracle);
    }

    function setCommissionfee(uint256 _commissionfee) external whenPaused onlyAdmin {
        require(_commissionfee <= MAX_COMMISSION_FEE, "E04");
        commissionfee = _commissionfee;
    }

    function setAdmin(address _adminAddress) external onlyOwner {
        require(_adminAddress != address(0), "E31");
        adminAddress = _adminAddress;
    }

    function _transferReward(address _user) internal {
        uint256 reward = 0; // Initializes reward

        for (uint256 epoch = 1; epoch <= currentEpoch; epoch++) {
            if (rounds[epoch].startTimestamp == 0 || (block.timestamp < rounds[epoch].closeTimestamp + bufferSeconds)) {
                continue;
            }

            Round memory round = rounds[epoch];
            // 0: Over, 1: Under
            uint256 pst = 0;
            while (pst <= uint256(Position.Under)) {
                Position position = pst == 0 ? Position.Over : Position.Under;
                uint256 addedReward = 0;

                // Round vaild, claim rewards
                if (claimable(epoch, position, _user)) {
                    if ((round.overAmount > 0 && round.underAmount > 0) && (round.startPrice != round.closePrice)) {
                        addedReward +=
                            (ledger[epoch][position][_user].amount * round.rewardAmount) / round.rewardBaseCalAmount;
                    }
                    addedReward += ledger[epoch][position][_user].amount;
                } else {
                    // Round invaild, refund bet amount
                    if (refundable(epoch, position, _user)) {
                        addedReward += ledger[epoch][position][_user].amount;
                    }
                }

                if (addedReward != 0) {
                    ledger[epoch][position][_user].claimed = true;
                    reward += addedReward;
                    emit Claim(_user, epoch, position, addedReward);
                }
                pst++;
            }
        }
        if (reward > 0) {
            token.safeTransfer(_user, reward);
        }
    }

    function claimable(uint256 epoch, Position position, address user) public view returns (bool) {
        ParticipateInfo memory participateInfo = ledger[epoch][position][user];
        Round memory round = rounds[epoch];

        bool isPossible = false;
        if (round.overAmount > 0 && round.underAmount > 0) {
            isPossible = (
                (
                    round.closePrice > _getStrategyRatePrice(round.startPrice)
                        && participateInfo.position == Position.Over
                )
                    || (
                        round.closePrice < _getStrategyRatePrice(round.startPrice)
                            && participateInfo.position == Position.Under
                    ) || (round.closePrice == _getStrategyRatePrice(round.startPrice))
            );
        } else {
            // refund user's fund if there is no paticipation on the other side
            isPossible = true;
        }
        return round.oracleCalled && participateInfo.amount != 0 && !participateInfo.claimed && isPossible;
    }

    function refundable(uint256 epoch, Position position, address user) public view returns (bool) {
        ParticipateInfo memory participateInfo = ledger[epoch][position][user];
        return !rounds[epoch].oracleCalled && !participateInfo.claimed
            && block.timestamp > rounds[epoch].closeTimestamp + bufferSeconds && participateInfo.amount != 0;
    }

    function _calculateRewards(uint256 epoch) internal {
        require(rounds[epoch].rewardBaseCalAmount == 0 && rounds[epoch].rewardAmount == 0, "E29");
        Round storage round = rounds[epoch];
        uint256 rewardBaseCalAmount;
        uint256 treasuryAmt;
        uint256 rewardAmount;

        // No participation on the other side refund participant amount to users
        if (round.overAmount == 0 || round.underAmount == 0) {
            rewardBaseCalAmount = 0;
            rewardAmount = 0;
            treasuryAmt = 0;
        } else {
            // Over wins
            if (round.closePrice > _getStrategyRatePrice(round.startPrice)) {
                rewardBaseCalAmount = round.overAmount;
                treasuryAmt = (round.underAmount * commissionfee) / BASE;
                rewardAmount = round.underAmount - treasuryAmt;
            }
            // Under wins
            else if (round.closePrice < _getStrategyRatePrice(round.startPrice)) {
                rewardBaseCalAmount = round.underAmount;
                treasuryAmt = (round.overAmount * commissionfee) / BASE;
                rewardAmount = round.overAmount - treasuryAmt;
            }
            // No one wins refund participant amount to users
            else {
                rewardBaseCalAmount = 0;
                rewardAmount = 0;
                treasuryAmt = 0;
            }
        }
        round.rewardBaseCalAmount = rewardBaseCalAmount;
        round.rewardAmount = rewardAmount;

        // Add to treasury
        treasuryAmount += treasuryAmt;

        emit RewardsCalculated(epoch, rewardBaseCalAmount, rewardAmount, treasuryAmt);
    }

    function _getStrategyRatePrice(int256 price) internal view returns (int256) {
        if (strategyType == StrategyType.Up) {
            return price + (price * strategyRate) / int256(BASE);
        } else if (strategyType == StrategyType.Down) {
            return price - (price * strategyRate) / int256(BASE);
        } else {
            return price;
        }
    }

    function _safeEndRound(uint256 epoch, int256 price) internal {
        require(rounds[epoch].startTimestamp != 0, "E26");
        require(block.timestamp >= rounds[epoch].closeTimestamp, "E27");
        require(block.timestamp <= rounds[epoch].closeTimestamp + bufferSeconds, "E28");
        rounds[epoch].closePrice = price;
        rounds[epoch].oracleCalled = true;

        emit EndRound(epoch, rounds[epoch].closePrice);
    }

    function _safeStartRound(uint256 epoch, int256 price) internal {
        require(rounds[epoch].openTimestamp != 0, "E23");
        require(block.timestamp >= rounds[epoch].startTimestamp, "E24");
        require(block.timestamp <= rounds[epoch].startTimestamp + bufferSeconds, "E25");
        rounds[epoch].startPrice = price;
        emit StartRound(epoch, rounds[epoch].startPrice);
    }

    function _safeOpenRound(uint256 epoch, uint256 initDate) internal {
        require(genesisOpenOnce, "E16");
        require(rounds[epoch - 2].closeTimestamp != 0, "E17");
        require(block.timestamp >= rounds[epoch - 2].closeTimestamp, "E18");
        require(block.timestamp >= initDate, "E19");
        _openRound(epoch, initDate);
    }

    function _openRound(uint256 epoch, uint256 initDate) internal {
        require(block.timestamp >= initDate, "E19");

        rounds[epoch].openTimestamp = initDate;
        rounds[epoch].startTimestamp = initDate + intervalSeconds;
        rounds[epoch].closeTimestamp = initDate + (2 * intervalSeconds);
        rounds[epoch].epoch = epoch;
        rounds[epoch].totalAmount = 0;

        emit OpenRound(epoch, strategyRate, strategyType);
    }

    function _participable(uint256 epoch) internal view returns (bool) {
        return rounds[epoch].openTimestamp != 0 && rounds[epoch].startTimestamp != 0
            && block.timestamp > rounds[epoch].openTimestamp && block.timestamp < rounds[epoch].startTimestamp;
    }

    function _participate(uint256 epoch, Position _position, address _user, uint256 _amount) internal {
        // Update user data
        ParticipateInfo storage participateInfo = ledger[epoch][_position][_user];

        participateInfo.position = _position;
        participateInfo.amount = participateInfo.amount + _amount;

        // @audit why do we need userRounds? and this can be forged when participated in the same epoch
        userRounds[_user].push(epoch);

        // Update user round data
        Round storage round = rounds[epoch];
        round.totalAmount = round.totalAmount + _amount;
        if (_position == Position.Over) {
            round.overAmount = round.overAmount + _amount;
            emit ParticipateOver(msg.sender, epoch, _amount);
        } else {
            round.underAmount = round.underAmount + _amount;
            emit ParticipateUnder(msg.sender, epoch, _amount);
        }
    }

    //@audit this is not a valid guard, use tx.origin == msg.sender instead
    //function _isContract(address account) internal view returns (bool) {
    //    uint256 size;
    //    assembly {
    //        size := extcodesize(account)
    //    }
    //    return size > 0;
    //}
}
