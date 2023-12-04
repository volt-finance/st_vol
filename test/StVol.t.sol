pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "contracts/StVol.sol";
import "contracts/mock/MockPyth.sol";
import "contracts/mock/MockERC20.sol";
import "./itoa.sol";
import "forge-std/console.sol";

contract StVolTest is Test {

    StVol stvol;
    MockPyth pyth;
    MockERC20 usdc;

    address admin;
    address operator;
    address operatorVault;
    uint256 commissionFee;
    int256 strategyRate;
    bytes[] data;

    function setUp() public {
        pyth = new MockPyth();
        usdc = new MockERC20("Mock", "MOCK", 0);
        admin = makeAddr("admin");
        operator = makeAddr("operator");
        operatorVault = makeAddr("operatorVault");
        commissionFee = 0;
        strategyRate = 0;
        stvol = new StVol(
            address(usdc),
            address(pyth),
            admin,
            operator,
            operatorVault,
            commissionFee,
            strategyRate,
            StVol.StrategyType.None,
            bytes32(0)
        );
        vm.warp(1000);
        data = new bytes[](1);
    }

    function updatePrice(uint256 price) internal {
        pyth.setPrice(int64(uint64(price)), 0, 0, block.timestamp - 5);
    }

    function testGenesis() external {
        vm.startPrank(operator);

        updatePrice(1000);
        assertEq(stvol.currentEpoch(), 0);
        stvol.genesisOpenRound(block.timestamp - 10);
        assertEq(stvol.currentEpoch(), 1);
        vm.warp(block.timestamp + 86400);
        stvol.genesisStartRound(data, uint64(block.timestamp - 10), false); // TODO what is isFixed?

        vm.stopPrank();
    }

    function verifyStatus(uint256 epoch, BetConfig memory config) internal {
        StVol.Round memory round = stvol.getRound(epoch);
        assertEq(round.epoch, epoch);
        //assertEq(uint256(round.startPrice), 1000);
        //assertEq(uint256(round.closePrice), 1000 + config.result - 1);
        assertEq(round.totalAmount, config.betUpAmount + config.betDownAmount);
        assertEq(round.overAmount, config.betUpAmount);
        assertEq(round.underAmount, config.betDownAmount);
    }

    struct BetConfig {
        uint256 betUp;
        uint256 betDown;
        uint256 betUpAmount;
        uint256 betDownAmount;
        uint256 result;
    }

    function sanitize(BetConfig memory config) internal pure returns (BetConfig memory) {
        config.betUp = bound(config.betUp, 1, 10);
        config.betDown = bound(config.betDown, 1, 10);
        config.betUpAmount = bound(config.betUpAmount, 1e18, 1000e18);
        config.betUpAmount = (config.betUpAmount / config.betUp) * config.betUp;
        config.betDownAmount = bound(config.betDownAmount, 1e18, 1000e18);
        config.betDownAmount = (config.betDownAmount / config.betDown) * config.betDown;
        config.result = bound(config.result, 0, 2);
        return config;
    }

    function betUp(uint256 round, BetConfig memory config) internal {
        for(uint256 i = 0; i < config.betUp; i++) {
            uint256 amt = config.betUpAmount / config.betUp;
            address user = makeAddr(string(abi.encodePacked("up", itoa(i))));
            usdc.mint(user, amt);

            vm.startPrank(user);
            usdc.approve(address(stvol), amt);
            stvol.participateOver(round, amt);
            vm.stopPrank();
        }
    }

    function claimUp(uint256 round, BetConfig memory config) internal {
        for(uint256 i = 0; i < config.betUp; i++) {
            address user = makeAddr(string(abi.encodePacked("up", itoa(i))));
            uint256 bal = usdc.balanceOf(user);
            // check balance
            if(config.result == 2) {
                vm.startPrank(user);
                stvol.claim(round, StVol.Position.Over);
                bal = usdc.balanceOf(user) - bal;
                vm.stopPrank();
                uint256 expected = (config.betUpAmount + config.betDownAmount) * config.betUpAmount / (config.betUp * config.betUpAmount);
                // allow 1% error
                assertApproxEqRel(bal, expected, 1e16);
            } else if(config.result == 1){
                vm.startPrank(user);
                stvol.claim(round, StVol.Position.Over);
                bal = usdc.balanceOf(user) - bal;
                vm.stopPrank();
                assertEq(bal, config.betUpAmount / config.betUp);
            } else {
                assertEq(false, stvol.claimable(round, StVol.Position.Over, user));
            }
        }
    }

    function claimDown(uint256 round, BetConfig memory config) internal {
        for(uint256 i = 0; i < config.betDown; i++) {
            address user = makeAddr(string(abi.encodePacked("down", itoa(i))));
            uint256 bal = usdc.balanceOf(user);
            // check balance
            if(config.result == 0) {
                vm.startPrank(user);
                stvol.claim(round, StVol.Position.Under);
                bal = usdc.balanceOf(user) - bal;
                vm.stopPrank();
                uint256 expected = (config.betUpAmount + config.betDownAmount) * config.betDownAmount / (config.betDown * config.betDownAmount);
                // allow 1% error
                assertApproxEqRel(bal, expected, 1e16);
            } else if (config.result == 1) {
                vm.startPrank(user);
                stvol.claim(round, StVol.Position.Under);
                bal = usdc.balanceOf(user) - bal;
                vm.stopPrank();
                assertEq(bal, config.betDownAmount / config.betDown);
            } else {
                assertEq(false, stvol.claimable(round, StVol.Position.Under, user));
            }
        }
    }

    function betDown(uint256 round, BetConfig memory config) internal {
        for(uint256 i = 0; i < config.betDown; i++) {
            uint256 amt = config.betDownAmount / config.betDown;
            address user = makeAddr(string(abi.encodePacked("down", itoa(i))));
            usdc.mint(user, amt);

            vm.startPrank(user);
            usdc.approve(address(stvol), amt);
            stvol.participateUnder(round, amt);
            vm.stopPrank();
        }
    }

    function testBetArray(BetConfig[] memory config) external {
        vm.assume(config.length > 0 && config.length < 1000);
        config[0] = sanitize(config[0]);
        openGenesis(config[0]);
        bet(1, config[0]);
        startGenesis(config[0]);

        for(uint256 i = 1; i < config.length - 1; i++) {
            config[i] = sanitize(config[i]);
            bet(i + 1, config[i]);
            executeRound(i, config[i-1]);
        }
    }

    function openGenesis(BetConfig memory config) internal {
        vm.startPrank(operator);
        updatePrice(1000);
        uint256 before = stvol.currentEpoch();
        // Epoch - 1, genesis(round 1) Open
        stvol.genesisOpenRound(block.timestamp - 10);
        assertEq(stvol.currentEpoch(), before + 1);
        vm.stopPrank();
    }

    function startGenesis(BetConfig memory config) internal {
        vm.startPrank(operator);
        // Epoch - 2, genesis(round 1) Start, round 2 open
        vm.warp(block.timestamp + 86400);
        uint256 before = stvol.currentEpoch();
        stvol.genesisStartRound(data, uint64(block.timestamp - 10), false); // TODO what is isFixed?
        assertEq(stvol.currentEpoch(), before + 1);
        vm.stopPrank();
    }

    function bet(uint256 round, BetConfig memory config) internal {
        betUp(round, config);
        betDown(round, config);
    }

    function executeRound(uint256 round, BetConfig memory config) internal {
        // Epoch - 3, genesis(round 1) End, round 2 start, round 3 open
        vm.startPrank(operator);
        vm.warp(block.timestamp + 86400 + 1);
        updatePrice(uint256(int256((pyth.getPrice(bytes32(0))).price)) + config.result - 1);
        stvol.executeRound(data, uint64(block.timestamp - 10), false);
        verifyStatus(round, config);

        assertEq(stvol.currentEpoch(), round + 2);
        vm.stopPrank();
        // claim rewards
        claimUp(round, config);
        claimDown(round, config);
    }

    function testGenesisBet(BetConfig memory config) public {
        config = sanitize(config);

        openGenesis(config);

        bet(1, config);

        startGenesis(config);
        
        executeRound(1, config);
    }

    function getRefunded(uint256 round, BetConfig memory config) internal {
        for(uint256 i = 0; i < config.betUp; i++) {
            address user = makeAddr(string(abi.encodePacked("up", itoa(i))));
            uint256 bal = usdc.balanceOf(user);
            vm.startPrank(user);
            stvol.claim(round, StVol.Position.Over);
            bal = usdc.balanceOf(user) - bal;
            vm.stopPrank();
            assertEq(bal, config.betUpAmount / config.betUp);
        }
        for(uint256 i = 0; i < config.betDown; i++) {
            address user = makeAddr(string(abi.encodePacked("down", itoa(i))));
            uint256 bal = usdc.balanceOf(user);
            vm.startPrank(user);
            stvol.claim(round, StVol.Position.Under);
            bal = usdc.balanceOf(user) - bal;
            vm.stopPrank();
            assertEq(bal, config.betDownAmount / config.betDown);
        }
    }

    function testPause(BetConfig[4] memory config) public {
        config[0] = sanitize(config[0]);
        openGenesis(config[0]);
        bet(1, config[0]);
        startGenesis(config[0]);

        config[1] = sanitize(config[1]);
        bet(2, config[1]);

        // pause
        vm.startPrank(admin);
        stvol.pause();
        stvol.unpause();
        vm.stopPrank();

        config[2] = sanitize(config[2]);
        openGenesis(config[2]);
        bet(3, config[2]);
        startGenesis(config[2]);

        executeRound(3, config[2]);
        getRefunded(1, config[0]);
        vm.warp(block.timestamp + 86400);
        getRefunded(2, config[1]);
    }
}
