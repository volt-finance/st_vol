import { ethers, artifacts, contract } from "hardhat";
import { assert } from "chai";
import { BN, constants, expectEvent, expectRevert, time, ether, balance } from "@openzeppelin/test-helpers";

const StVol = artifacts.require("StVol");
const Oracle = artifacts.require("MockAggregatorV3");
const MockERC20 = artifacts.require("./utils/MockERC20.sol");

const GAS_PRICE = 8000000000; // hardhat default
// BLOCK_COUNT_MULTPLIER: Only for test, because testing trx causes block to increment which exceeds blockBuffer time checks
// Note that the higher this value is, the slower the test will run
const BLOCK_COUNT_MULTPLIER = 5;
const DECIMALS = 8; // Chainlink default for ETH/USD
const INITIAL_PRICE = 10000000000; // $100, 8 decimal places
const INTERVAL_SECONDS = 20 * BLOCK_COUNT_MULTPLIER; // 20 seconds * multiplier
const BUFFER_SECONDS = 5 * BLOCK_COUNT_MULTPLIER; // 5 seconds * multplier, round must lock/end within this buffer
const MIN_AMOUNT = ether("0.000001"); // 1 USDC
const UPDATE_ALLOWANCE = 30 * BLOCK_COUNT_MULTPLIER; // 30s * multiplier
const INITIAL_REWARD_RATE = 0.9; // 90%
const INITIAL_COMMISSION_RATE = 0.02; // 2%
const INITIAL_OPERATE_RATE = 0.3; // 30%
const INITIAL_PARTICIPATE_RATE = 0.7; // 70%

// Enum: 0 = Over, 1 = Under
const Position = {
  Over: "0",
  Under: "1",
};

const calcGasCost = (gasUsed: number) => new BN(GAS_PRICE * gasUsed);

const assertBNArray = (arr1: any[], arr2: any | any[]) => {
  assert.equal(arr1.length, arr2.length);
  arr1.forEach((n1, index) => {
    assert.equal(n1.toString(), new BN(arr2[index]).toString());
  });
};

contract(
  "StVol",
  ([operator, admin, owner, overUser1, overUser2, overUser3, underUser1, underUser2, underUser3, participantVault]) => {
    // mock usdc total supply
    const _totalInitSupply = ether("10000000000");
    let currentEpoch: any;
    let oracle: { address: any; updateAnswer: (arg0: number) => any };
    let stVol: any;
    let mockUsdc: any;

    async function nextEpoch() {
      await time.increaseTo((await time.latest()).toNumber() + INTERVAL_SECONDS); // Elapse 20 seconds
    }

    beforeEach(async () => {
      // Deploy USDC
      mockUsdc = await MockERC20.new("Mock USDC", "USDC", _totalInitSupply);
      // mint usdc for test accounts
      const MintAmount = ether("100"); // 100 USDC

      mockUsdc.mintTokens(MintAmount, { from: overUser1 });
      mockUsdc.mintTokens(MintAmount, { from: overUser2 });
      mockUsdc.mintTokens(MintAmount, { from: overUser3 });
      mockUsdc.mintTokens(MintAmount, { from: underUser1 });
      mockUsdc.mintTokens(MintAmount, { from: underUser2 });
      mockUsdc.mintTokens(MintAmount, { from: underUser3 });

      oracle = await Oracle.new(DECIMALS, INITIAL_PRICE);

      stVol = await StVol.new(
        mockUsdc.address,
        oracle.address,
        admin,
        operator,
        participantVault,
        INTERVAL_SECONDS,
        BUFFER_SECONDS,
        MIN_AMOUNT,
        UPDATE_ALLOWANCE,
        String(INITIAL_COMMISSION_RATE * 10000),
        String(INITIAL_OPERATE_RATE * 10000),
        String(INITIAL_PARTICIPATE_RATE * 10000),
        { from: owner }
      );
      // approve usdc amount for stVol contract
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overUser1 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overUser2 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overUser3 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underUser1 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underUser2 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underUser3 });
    });

    it("Initialize", async () => {
      assert.equal(await mockUsdc.balanceOf(stVol.address), 0);
      assert.equal(await stVol.currentEpoch(), 0);
      assert.equal(await stVol.intervalSeconds(), INTERVAL_SECONDS);
      assert.equal(await stVol.adminAddress(), admin);
      assert.equal(await stVol.treasuryAmount(), 0);
      assert.equal(await stVol.minParticipateAmount(), MIN_AMOUNT.toString());
      assert.equal(await stVol.oracleUpdateAllowance(), UPDATE_ALLOWANCE);
      assert.equal(await stVol.genesisOpenOnce(), false);
      assert.equal(await stVol.genesisStartOnce(), false);
      assert.equal(await stVol.paused(), false);
    });

    it("Should start genesis rounds (round 1, round 2, round 3)", async () => {
      // Manual block calculation
      let currentTimestamp = (await time.latest()).toNumber();

      // Epoch 0
      assert.equal((await time.latest()).toNumber(), currentTimestamp);
      assert.equal(await stVol.currentEpoch(), 0);

      // Epoch 1: Start genesis round 1
      let tx = await stVol.genesisOpenRound();
      currentTimestamp = (await time.latest()).toNumber();
      expectEvent(tx, "OpenRound", { epoch: new BN(1) });
      assert.equal(await stVol.currentEpoch(), 1);

      // Start round 1
      assert.equal(await stVol.genesisOpenOnce(), true);
      assert.equal(await stVol.genesisStartOnce(), false);
      assert.equal((await stVol.rounds(1)).openTimestamp, currentTimestamp);
      assert.equal((await stVol.rounds(1)).startTimestamp, currentTimestamp + INTERVAL_SECONDS);
      assert.equal((await stVol.rounds(1)).closeTimestamp, currentTimestamp + INTERVAL_SECONDS * 2);
      assert.equal((await stVol.rounds(1)).epoch, 1);
      assert.equal((await stVol.rounds(1)).totalAmount, 0);

      // Elapse 20 blocks
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      // Epoch 2: Lock genesis round 1 and starts round 2
      tx = await stVol.genesisStartRound();
      currentTimestamp = (await time.latest()).toNumber();

      expectEvent(tx, "StartRound", {
        epoch: new BN(1),
        roundId: new BN(1),
        price: new BN(INITIAL_PRICE),
      });

      expectEvent(tx, "OpenRound", { epoch: new BN(2) });
      assert.equal(await stVol.currentEpoch(), 2);

      // Lock round 1
      assert.equal(await stVol.genesisOpenOnce(), true);
      assert.equal(await stVol.genesisStartOnce(), true);
      assert.equal((await stVol.rounds(1)).startPrice, INITIAL_PRICE);

      // Start round 2
      assert.equal((await stVol.rounds(2)).openTimestamp, currentTimestamp);
      assert.equal((await stVol.rounds(2)).startTimestamp, currentTimestamp + INTERVAL_SECONDS);
      assert.equal((await stVol.rounds(2)).closeTimestamp, currentTimestamp + 2 * INTERVAL_SECONDS);
      assert.equal((await stVol.rounds(2)).epoch, 2);
      assert.equal((await stVol.rounds(2)).totalAmount, 0);

      // Elapse 20 blocks
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      // Epoch 3: End genesis round 1, locks round 2, starts round 3
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      tx = await stVol.executeRound();
      // currentTimestamp += 2; // Oracle update and execute round
      currentTimestamp = (await time.latest()).toNumber();

      expectEvent(tx, "EndRound", {
        epoch: new BN(1),
        roundId: new BN(2),
        price: new BN(INITIAL_PRICE),
      });

      expectEvent(tx, "StartRound", {
        epoch: new BN(2),
        roundId: new BN(2),
        price: new BN(INITIAL_PRICE),
      });

      expectEvent(tx, "OpenRound", { epoch: new BN(3) });
      assert.equal(await stVol.currentEpoch(), 3);

      // End round 1
      assert.equal((await stVol.rounds(1)).closePrice, INITIAL_PRICE);

      // Lock round 2
      assert.equal((await stVol.rounds(2)).startPrice, INITIAL_PRICE);
    });

    it("Should not start rounds before genesis start and lock round has triggered", async () => {
      await expectRevert(stVol.genesisStartRound(), "Can only run after genesisOpenRound is triggered");
      await expectRevert(
        stVol.executeRound(),
        "Can only run after genesisOpenRound and genesisStartRound is triggered"
      );

      await stVol.genesisOpenRound();
      await expectRevert(
        stVol.executeRound(),
        "Can only run after genesisOpenRound and genesisStartRound is triggered"
      );

      await nextEpoch();
      await stVol.genesisStartRound(); // Success

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await stVol.executeRound(); // Success
    });

    it("Should not lock round before startTimestamp and end round before closeTimestamp", async () => {
      await stVol.genesisOpenRound();
      await expectRevert(stVol.genesisStartRound(), "Can only start round after startTimestamp");
      await nextEpoch();
      await stVol.genesisStartRound();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await expectRevert(stVol.executeRound(), "Can only start round after startTimestamp");

      await nextEpoch();
      await stVol.executeRound(); // Success
    });

    it("Should record oracle price", async () => {
      // Epoch 1
      await stVol.genesisOpenRound();
      assert.equal((await stVol.rounds(1)).startPrice, 0);
      assert.equal((await stVol.rounds(1)).closePrice, 0);

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await stVol.genesisStartRound(); // For round 1
      assert.equal((await stVol.rounds(1)).startPrice, price120);
      assert.equal((await stVol.rounds(1)).closePrice, 0);
      assert.equal((await stVol.rounds(2)).startPrice, 0);
      assert.equal((await stVol.rounds(2)).closePrice, 0);

      // Epoch 3
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await stVol.executeRound();
      assert.equal((await stVol.rounds(1)).startPrice, price120);
      assert.equal((await stVol.rounds(1)).closePrice, price130);
      assert.equal((await stVol.rounds(2)).startPrice, price130);
      assert.equal((await stVol.rounds(2)).closePrice, 0);
      assert.equal((await stVol.rounds(3)).startPrice, 0);
      assert.equal((await stVol.rounds(3)).closePrice, 0);

      // Epoch 4
      await nextEpoch();
      const price140 = 14000000000; // $140
      await oracle.updateAnswer(price140);
      await stVol.executeRound();
      assert.equal((await stVol.rounds(1)).startPrice, price120);
      assert.equal((await stVol.rounds(1)).closePrice, price130);
      assert.equal((await stVol.rounds(2)).startPrice, price130);
      assert.equal((await stVol.rounds(2)).closePrice, price140);
      assert.equal((await stVol.rounds(3)).startPrice, price140);
      assert.equal((await stVol.rounds(3)).closePrice, 0);
      assert.equal((await stVol.rounds(4)).startPrice, 0);
      assert.equal((await stVol.rounds(4)).closePrice, 0);
    });

    it("Should reject oracle data if data is stale", async () => {
      await stVol.genesisOpenRound();
      await nextEpoch();
      await stVol.genesisStartRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await stVol.executeRound();

      // Oracle not updated, so roundId is same as previously recorded
      await nextEpoch();
      await expectRevert(stVol.executeRound(), "Oracle update roundId must be larger than oracleLatestRoundId");
    });

    it("Should record data and user multiple participates", async () => {
      // Epoch 1
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1.1"), { from: overUser1 }); // 1.1 USDC
      await stVol.participateOver(currentEpoch, ether("1.1"), { from: overUser1 }); // 1.1 USDC

      await stVol.participateUnder(currentEpoch, ether("3.1"), { from: underUser1 }); // 3.1 USDC
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("5.3").toString()); // 5.3 USDC
      assert.equal((await stVol.rounds(1)).totalAmount, ether("5.3").toString());
      assert.equal((await stVol.rounds(1)).overAmount, ether("2.2").toString());
      assert.equal((await stVol.rounds(1)).underAmount, ether("3.1").toString());

      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).amount, ether("2.2").toString());
    });

    it("Should record data and user participate", async () => {
      // Epoch 1
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1.1"), { from: overUser1 }); // 1.1 USDC
      await stVol.participateOver(currentEpoch, ether("1.2"), { from: overUser2 }); // 1.2 USDC
      await stVol.participateUnder(currentEpoch, ether("1.4"), { from: underUser1 }); // 1.4 USDC

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("3.7").toString()); // 3.7 USDC
      assert.equal((await stVol.rounds(1)).totalAmount, ether("3.7").toString()); // 3.7 USDC
      assert.equal((await stVol.rounds(1)).overAmount, ether("2.3").toString()); // 2.3 USDC
      assert.equal((await stVol.rounds(1)).underAmount, ether("1.4").toString()); // 1.4 USDC
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).amount, ether("1.1").toString());
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).amount, ether("1.2").toString());
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).position, Position.Under);
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).amount, ether("1.4").toString());
      assertBNArray((await stVol.getUserRounds(overUser1, 0, 1))[0], [1]);
      assertBNArray((await stVol.getUserRounds(overUser2, 0, 1))[0], [1]);
      assertBNArray((await stVol.getUserRounds(underUser1, 0, 1))[0], [1]);
      assert.equal(await stVol.getUserRoundsLength(overUser1), 1);

      // Epoch 2
      await nextEpoch();
      await stVol.genesisStartRound(); // For round 1
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("2.1"), { from: overUser1 }); // 2.1 USDC
      await stVol.participateOver(currentEpoch, ether("2.2"), { from: overUser2 }); // 2.2 USDC
      await stVol.participateUnder(currentEpoch, ether("2.4"), { from: underUser1 }); // 2.4 USDC

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("10.4").toString()); // 10.4 USDC (3.7+6.7)
      assert.equal((await stVol.rounds(2)).totalAmount, ether("6.7").toString()); // 6.7 USDC
      assert.equal((await stVol.rounds(2)).overAmount, ether("4.3").toString()); // 4.3 USDC
      assert.equal((await stVol.rounds(2)).underAmount, ether("2.4").toString()); // 2.4 USDC
      assert.equal((await stVol.ledger(2, Position.Over, overUser1)).position, Position.Over);
      assert.equal((await stVol.ledger(2, Position.Over, overUser1)).amount, ether("2.1").toString());
      assert.equal((await stVol.ledger(2, Position.Over, overUser2)).position, Position.Over);
      assert.equal((await stVol.ledger(2, Position.Over, overUser2)).amount, ether("2.2").toString());
      assert.equal((await stVol.ledger(2, Position.Under, underUser1)).position, Position.Under);
      assert.equal((await stVol.ledger(2, Position.Under, underUser1)).amount, ether("2.4").toString());
      assertBNArray((await stVol.getUserRounds(overUser1, 0, 2))[0], [1, 2]);
      assertBNArray((await stVol.getUserRounds(overUser2, 0, 2))[0], [1, 2]);
      assertBNArray((await stVol.getUserRounds(underUser1, 0, 2))[0], [1, 2]);
      assert.equal(await stVol.getUserRoundsLength(overUser1), 2);

      // Epoch 3
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("3.1"), { from: overUser1 }); // 3.1 USDC
      await stVol.participateOver(currentEpoch, ether("3.2"), { from: overUser2 }); // 3.2 USDC
      await stVol.participateUnder(currentEpoch, ether("3.4"), { from: underUser1 }); // 3.4 USDC

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("20.1").toString()); // 20.1 USDC (3.7+6.7+9.7)
      assert.equal((await stVol.rounds(3)).totalAmount, ether("9.7").toString()); // 9.7 USDC
      assert.equal((await stVol.rounds(3)).overAmount, ether("6.3").toString()); // 6.3 USDC
      assert.equal((await stVol.rounds(3)).underAmount, ether("3.4").toString()); // 3.4 USDC
      assert.equal((await stVol.ledger(3, Position.Over, overUser1)).position, Position.Over);
      assert.equal((await stVol.ledger(3, Position.Over, overUser1)).amount, ether("3.1").toString());
      assert.equal((await stVol.ledger(3, Position.Over, overUser2)).position, Position.Over);
      assert.equal((await stVol.ledger(3, Position.Over, overUser2)).amount, ether("3.2").toString());
      assert.equal((await stVol.ledger(3, Position.Under, underUser1)).position, Position.Under);
      assert.equal((await stVol.ledger(3, Position.Under, underUser1)).amount, ether("3.4").toString());
      assertBNArray((await stVol.getUserRounds(overUser1, 0, 3))[0], [1, 2, 3]);
      assertBNArray((await stVol.getUserRounds(overUser2, 0, 3))[0], [1, 2, 3]);
      assertBNArray((await stVol.getUserRounds(underUser1, 0, 3))[0], [1, 2, 3]);
      assert.equal(await stVol.getUserRoundsLength(overUser1), 3);

      // Epoch 4
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("4.1"), { from: overUser1 }); // 4.1 USDC
      await stVol.participateOver(currentEpoch, ether("4.2"), { from: overUser2 }); // 4.2 USDC
      await stVol.participateUnder(currentEpoch, ether("4.4"), { from: underUser1 }); // 4.4 USDC

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("32.8").toString()); // 32.8 USDC (3.7+6.7+9.7+12.7)
      assert.equal((await stVol.rounds(4)).totalAmount, ether("12.7").toString()); // 12.7 USDC
      assert.equal((await stVol.rounds(4)).overAmount, ether("8.3").toString()); // 8.3 USDC
      assert.equal((await stVol.rounds(4)).underAmount, ether("4.4").toString()); // 4.4 USDC
      assert.equal((await stVol.ledger(4, Position.Over, overUser1)).position, Position.Over);
      assert.equal((await stVol.ledger(4, Position.Over, overUser1)).amount, ether("4.1").toString());
      assert.equal((await stVol.ledger(4, Position.Over, overUser2)).position, Position.Over);
      assert.equal((await stVol.ledger(4, Position.Over, overUser2)).amount, ether("4.2").toString());
      assert.equal((await stVol.ledger(4, Position.Under, underUser1)).position, Position.Under);
      assert.equal((await stVol.ledger(4, Position.Under, underUser1)).amount, ether("4.4").toString());
      assertBNArray((await stVol.getUserRounds(overUser1, 0, 4))[0], [1, 2, 3, 4]);
      assertBNArray((await stVol.getUserRounds(overUser2, 0, 4))[0], [1, 2, 3, 4]);
      assertBNArray((await stVol.getUserRounds(underUser1, 0, 4))[0], [1, 2, 3, 4]);
      assert.equal(await stVol.getUserRoundsLength(overUser1), 4);
    });

    it("Should not allow multiple participates", async () => {
      // Epoch 1
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // Success
      // await expectRevert(
      //   stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }),
      //   "Can only participate once per round"
      // );
      // await expectRevert(
      //   stVol.participateUnder(currentEpoch, ether("1"), { from: overUser1 }),
      //   "Can only participate once per round"
      // );
      await stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 }); // Success
      // await expectRevert(
      //   stVol.participateOver(currentEpoch, ether("1"), { from: underUser1 }),
      //   "Can only participate once per round"
      // );
      // await expectRevert(
      //   stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 }),
      //   "Can only participate once per round"
      // );

      // Epoch 2
      await nextEpoch();
      await stVol.genesisStartRound(); // For round 1
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // Success
      // await expectRevert(
      //   stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }),
      //   "Can only participate once per round"
      // );
      // await expectRevert(
      //   stVol.participateUnder(currentEpoch, ether("1"), { from: overUser1 }),
      //   "Can only participate once per round"
      // );
      await stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 }); // Success
      // await expectRevert(
      //   stVol.participateOver(currentEpoch, ether("1"), { from: underUser1 }),
      //   "Can only participate once per round"
      // );
      // await expectRevert(
      //   stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 }),
      //   "Can only participate once per round"
      // );

      // Epoch 3
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // Success
      // await expectRevert(
      //   stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }),
      //   "Can only participate once per round"
      // );
      // await expectRevert(
      //   stVol.participateUnder(currentEpoch, ether("1"), { from: overUser1 }),
      //   "Can only participate once per round"
      // );
      await stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 }); // Success
      // await expectRevert(
      //   stVol.participateOver(currentEpoch, ether("1"), { from: underUser1 }),
      //   "Can only participate once per round"
      // );
      // await expectRevert(
      //   stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 }),
      //   "Can only participate once per round"
      // );
    });

    it("Should not allow participate lesser than minimum participate amount", async () => {
      // Epoch 1
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await expectRevert(
        stVol.participateOver(currentEpoch, ether("0.0000005"), { from: overUser1 }),
        "Participate amount must be greater than minParticipateAmount"
      ); // 0.5 USDC
      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // Success

      // Epoch 2
      await nextEpoch();
      await stVol.genesisStartRound(); // For round 1
      currentEpoch = await stVol.currentEpoch();

      await expectRevert(
        stVol.participateOver(currentEpoch, ether("0.0000005"), { from: overUser1 }),
        "Participate amount must be greater than minParticipateAmount"
      ); // 0.5 USDC
      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // Success

      // Epoch 3
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await expectRevert(
        stVol.participateOver(currentEpoch, ether("0.0000005"), { from: overUser1 }),
        "Participate amount must be greater than minParticipateAmount"
      ); // 0.5 USDC
      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // Success
    });

    it("Should record rewards", async () => {
      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1.1"), { from: overUser1 }); // 1.1 USDC
      await stVol.participateOver(currentEpoch, ether("1.2"), { from: overUser2 }); // 1.2 USDC
      await stVol.participateUnder(currentEpoch, ether("1.4"), { from: underUser1 }); // 1.4 USDC

      assert.equal((await stVol.rounds(1)).rewardBaseCalAmount, 0);
      assert.equal((await stVol.rounds(1)).rewardAmount, 0);
      assert.equal(await stVol.treasuryAmount(), 0);
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("3.7").toString());

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await stVol.genesisStartRound(); // For round 1
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("2.1"), { from: overUser1 }); // 2.1 USDC
      await stVol.participateOver(currentEpoch, ether("2.2"), { from: overUser2 }); // 2.2 USDC
      await stVol.participateUnder(currentEpoch, ether("2.4"), { from: underUser1 }); // 2.4 USDC

      assert.equal((await stVol.rounds(1)).rewardBaseCalAmount, 0);
      assert.equal((await stVol.rounds(1)).rewardAmount, 0);
      assert.equal((await stVol.rounds(2)).rewardBaseCalAmount, 0);
      assert.equal((await stVol.rounds(2)).rewardAmount, 0);
      assert.equal(await stVol.treasuryAmount(), 0);
      assert.equal(
        (await mockUsdc.balanceOf(stVol.address)).toString(),
        ether("3.7").add(ether("6.7")).toString()
      );

      // Epoch 3, Round 1 is Over (130 > 120)
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("3.1"), { from: overUser1 }); // 3.1 USDC
      await stVol.participateOver(currentEpoch, ether("3.2"), { from: overUser2 }); // 3.2 USDC
      await stVol.participateUnder(currentEpoch, ether("3.4"), { from: underUser1 }); // 3.4 USDC

      assert.equal((await stVol.rounds(1)).rewardBaseCalAmount, ether("2.3").toString()); // 2.3 USDC, Over total
      assert.equal((await stVol.rounds(1)).rewardAmount, ether("3.7") - (ether("1.4") * INITIAL_COMMISSION_RATE)); // 3.56 USDC, Total - (Under total(losing side) * treasuryRate)
      assert.equal((await stVol.rounds(2)).rewardBaseCalAmount, 0);
      assert.equal((await stVol.rounds(2)).rewardAmount, 0);
      assert.equal(await stVol.treasuryAmount(), ether("1.4") * INITIAL_COMMISSION_RATE); // 0.14 USDC, Under total(losing side) * treasuryRate
      assert.equal(
        (await mockUsdc.balanceOf(stVol.address)).toString(),
        ether("3.7").add(ether("6.7")).add(ether("9.7")).toString()
      );

      // Epoch 4, Round 2 is Under (100 < 130)
      await nextEpoch();
      const price100 = 10000000000; // $100
      await oracle.updateAnswer(price100);
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("4.1"), { from: overUser1 }); // 4.1 USDC
      await stVol.participateOver(currentEpoch, ether("4.2"), { from: overUser2 }); // 4.2 USDC
      await stVol.participateUnder(currentEpoch, ether("4.4"), { from: underUser1 }); // 4.4 USDC

      assert.equal((await stVol.rounds(1)).rewardBaseCalAmount, ether("2.3").toString()); // 2.3 USDC, Over total
      assert.equal((await stVol.rounds(1)).rewardAmount, ether("3.7") - (ether("1.4") * INITIAL_COMMISSION_RATE)); // 3.56 USDC, Total - (Under total(losing side) * treasuryRate)
      assert.equal((await stVol.rounds(2)).rewardBaseCalAmount, ether("2.4").toString()); // 2.4 USDC, Under total
      assert.equal((await stVol.rounds(2)).rewardAmount, ether("6.7") - (ether("4.3") * INITIAL_COMMISSION_RATE)); // 6.27 USDC, Total - (Over total(losing side) * treasuryRate)
      assert.equal(await stVol.treasuryAmount(), ether("1.4").add(ether("4.3")) * INITIAL_COMMISSION_RATE); // 0.57, Accumulative treasury
      assert.equal(
        (await mockUsdc.balanceOf(stVol.address)).toString(),
        ether("3.7").add(ether("6.7")).add(ether("9.7")).add(ether("12.7")).toString()
      );
    });

    it("Should not lock round before startTimestamp", async () => {
      await stVol.genesisOpenRound();
      await nextEpoch();
      await stVol.genesisStartRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await stVol.executeRound();

      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await expectRevert(stVol.executeRound(), "Can only start round after startTimestamp");
      await nextEpoch();
      await stVol.executeRound(); // Success
    });

    it("Should claim rewards", async () => {
      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // 1 USDC
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 }); // 2 USDC
      await stVol.participateUnder(currentEpoch, ether("4"), { from: underUser1 }); // 4 USDC

      assert.equal(await stVol.claimable(1, Position.Over, overUser1), false);
      assert.equal(await stVol.claimable(1, Position.Over, overUser2), false);
      assert.equal(await stVol.claimable(1, Position.Under, underUser1), false);
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser1 }), "Round has not ended");
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser2 }), "Round has not ended");
      await expectRevert(stVol.claim(1, Position.Under, { from: underUser1 }), "Round has not ended");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser1 }), "Round has not started");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser2 }), "Round has not started");
      await expectRevert(stVol.claim(2, Position.Under, { from: underUser1 }), "Round has not started");

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await stVol.genesisStartRound(); // For round 1
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("21"), { from: overUser1 }); // 21 USDC
      await stVol.participateOver(currentEpoch, ether("22"), { from: overUser2 }); // 22 USDC
      await stVol.participateUnder(currentEpoch, ether("24"), { from: underUser1 }); // 24 USDC

      assert.equal(await stVol.claimable(1, Position.Over, overUser1), false);
      assert.equal(await stVol.claimable(1, Position.Over, overUser2), false);
      assert.equal(await stVol.claimable(1, Position.Under, underUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser2), false);
      assert.equal(await stVol.claimable(2, Position.Under, underUser1), false);
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser1 }), "Round has not ended");
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser2 }), "Round has not ended");
      await expectRevert(stVol.claim(1, Position.Under, { from: underUser1 }), "Round has not ended");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser1 }), "Round has not ended");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser2 }), "Round has not ended");
      await expectRevert(stVol.claim(2, Position.Under, { from: underUser1 }), "Round has not ended");

      // Epoch 3, Round 1 is Bull (130 > 120)
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await stVol.executeRound();

      assert.equal(await stVol.claimable(1, Position.Over, overUser1), true);
      assert.equal(await stVol.claimable(1, Position.Over, overUser2), true);
      assert.equal(await stVol.claimable(1, Position.Under, underUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser2), false);
      assert.equal(await stVol.claimable(2, Position.Under, underUser1), false);

      // Claim for Round 1: Total rewards = 6.92, Over = 3, Under = 4
      let tx = await stVol.claim(1, Position.Over, { from: overUser1 }); // Success
      let { gasUsed } = tx.receipt;

      expectEvent(tx, "Claim", { sender: overUser1, epoch: new BN("1"), position: Position.Over, amount: ether("2.306666666666666666") }); // 2.2 = (1 * 6.92) / 3

      tx = await stVol.claim(1, Position.Over, { from: overUser2 }); // Success
      gasUsed = tx.receipt.gasUsed;

      expectEvent(tx, "Claim", { sender: overUser2, epoch: new BN("1"), position: Position.Over, amount: ether("4.613333333333333333") }); // 4.613333333333333333 = (2 * 6.92) / 3

      await expectRevert(stVol.claim(1, Position.Under, { from: underUser1 }), "Not eligible for claim");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser1 }), "Round has not ended");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser2 }), "Round has not ended");
      await expectRevert(stVol.claim(2, Position.Under, { from: underUser1 }), "Round has not ended");

      // Epoch 4, Round 2 is Under (100 < 130)
      await nextEpoch();
      const price100 = 10000000000; // $100
      await oracle.updateAnswer(price100);
      await stVol.executeRound();

      assert.equal(await stVol.claimable(1, Position.Over, overUser1), false); // User has claimed
      assert.equal(await stVol.claimable(1, Position.Over, overUser2), false); // User has claimed
      assert.equal(await stVol.claimable(1, Position.Under, underUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser2), false);
      assert.equal(await stVol.claimable(2, Position.Under, underUser1), true);

      // Claim for Round 2: Total rewards = 66.14, Over = 43, Under = 24

      tx = await stVol.claim(2, Position.Under, { from: underUser1 }); // Success
      gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "Claim", { sender: underUser1, epoch: new BN("2"), position: Position.Under, amount: ether("66.140000000000000000") }); // 24 = (24 * 66.14) / 24

      await expectRevert(stVol.claim(1, Position.Over, { from: overUser1 }), "Not eligible for claim");
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser2 }), "Not eligible for claim");
      await expectRevert(stVol.claim(1, Position.Under, { from: underUser1 }), "Not eligible for claim");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser1 }), "Not eligible for claim");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser2 }), "Not eligible for claim");
      await expectRevert(stVol.claim(2, Position.Under, { from: underUser1 }), "Not eligible for claim");
    });

    it("Should multi claim rewards", async () => {
      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // 1 USDC
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 }); // 2 USDC
      await stVol.participateUnder(currentEpoch, ether("4"), { from: underUser1 }); // 4 USDC

      assert.equal(await stVol.claimable(1, Position.Over, overUser1), false);
      assert.equal(await stVol.claimable(1, Position.Over, overUser2), false);
      assert.equal(await stVol.claimable(1, Position.Under, underUser1), false);

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await stVol.genesisStartRound(); // For round 1
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("21"), { from: overUser1 }); // 21 USDC
      await stVol.participateOver(currentEpoch, ether("22"), { from: overUser2 }); // 22 USDC
      await stVol.participateUnder(currentEpoch, ether("24"), { from: underUser1 }); // 24 USDC

      // Epoch 3, Round 1 is Over (130 > 120)
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await stVol.executeRound();

      assert.equal(await stVol.claimable(1, Position.Over, overUser1), true);
      assert.equal(await stVol.claimable(1, Position.Over, overUser2), true);
      assert.equal(await stVol.claimable(1, Position.Under, underUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser2), false);
      assert.equal(await stVol.claimable(2, Position.Under, underUser1), false);

      // Epoch 4, Round 2 is Over (140 > 130)
      await nextEpoch();
      const price140 = 14000000000; // $140
      await oracle.updateAnswer(price140);
      await stVol.executeRound();

      assert.equal(await stVol.claimable(1, Position.Over, overUser1), true);
      assert.equal(await stVol.claimable(1, Position.Over, overUser2), true);
      assert.equal(await stVol.claimable(1, Position.Under, underUser1), false);
      assert.equal(await stVol.claimable(2, Position.Over, overUser1), true);
      assert.equal(await stVol.claimable(2, Position.Over, overUser2), true);
      assert.equal(await stVol.claimable(2, Position.Under, underUser1), false);

      let tx = await stVol.claim(1, Position.Over, { from: overUser1 }); // Success
      let { gasUsed } = tx.receipt;
      // 2.306666666666666666 = 1/3 * 6.92
      expectEvent(tx, "Claim", { sender: overUser1, epoch: new BN("1"), amount: ether("2.306666666666666666") });

      tx = await stVol.claim(2, Position.Over, { from: overUser1 }); // Success
      // 32.486511627906976744 = 21 / 43 * 66.52
      expectEvent(tx, "Claim", { sender: overUser1, epoch: new BN("2"), amount: ether("32.486511627906976744") });

      tx = await stVol.claim(1, Position.Over, { from: overUser2 }); // Success
      gasUsed = tx.receipt.gasUsed;

      // 4.613333333333333333 = 2/3 * 6.92
      expectEvent(tx, "Claim", { sender: overUser2, epoch: new BN("1"), amount: ether("4.613333333333333333") });
      tx = await stVol.claim(2, Position.Over, { from: overUser2 }); // Success
      // 34.033488372093023255 = 22 / 43 * 66.52
      expectEvent(tx, "Claim", { sender: overUser2, epoch: new BN("2"), amount: ether("34.033488372093023255") });

      await expectRevert(stVol.claim(1, Position.Over, { from: overUser1 }), "Not eligible for claim");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser1 }), "Not eligible for claim");
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser2 }), "Not eligible for claim");
      await expectRevert(stVol.claim(2, Position.Over, { from: overUser2 }), "Not eligible for claim");
      await expectRevert(stVol.claim(1, Position.Under, { from: underUser1 }), "Not eligible for claim");
      await expectRevert(stVol.claim(2, Position.Under, { from: underUser1 }), "Not eligible for claim");
    });

    it("Should record house wins", async () => {
      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // 1 USDC
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 }); // 2 USDC
      await stVol.participateUnder(currentEpoch, ether("4"), { from: underUser1 }); // 4 USDC

      // Epoch 2
      await nextEpoch();
      await oracle.updateAnswer(price110);
      await stVol.genesisStartRound(); // For round 1

      // Epoch 3, Round 1 is Same (110 == 110), House wins (refund participant amount to users)
      await nextEpoch();
      await oracle.updateAnswer(price110);
      await stVol.executeRound();

      let tx = await stVol.claim(1, Position.Over, { from: overUser1 }); // Success
      expectEvent(tx, "Claim", { sender: overUser1, epoch: new BN("1"), amount: ether("1") });
      tx = await stVol.claim(1, Position.Over, { from: overUser2 }); // Success
      expectEvent(tx, "Claim", { sender: overUser2, epoch: new BN("1"), amount: ether("2") });
      tx = await stVol.claim(1, Position.Under, { from: underUser1 }); // Success
      expectEvent(tx, "Claim", { sender: underUser1, epoch: new BN("1"), amount: ether("4") });

      assert.equal((await stVol.treasuryAmount()).toString(), ether("0").toString()); // 0

      await expectRevert(stVol.claim(1, Position.Over, { from: overUser1 }), "Not eligible for claim");
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser2 }), "Not eligible for claim");
      await expectRevert(stVol.claim(1, Position.Under, { from: underUser1 }), "Not eligible for claim");
    });

    it("Should claim treasury rewards", async () => {
      let predictionCurrentUSDC = ether("0");
      assert.equal(await mockUsdc.balanceOf(stVol.address), 0);

      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // 1 USDC
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 }); // 2 USDC
      await stVol.participateUnder(currentEpoch, ether("4"), { from: underUser1 }); // 4 USDC
      predictionCurrentUSDC = predictionCurrentUSDC.add(ether("7"));

      assert.equal(await stVol.treasuryAmount(), 0);
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), predictionCurrentUSDC.toString());

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await stVol.genesisStartRound(); // For round 1
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("21"), { from: overUser1 }); // 21 USDC
      await stVol.participateOver(currentEpoch, ether("22"), { from: overUser2 }); // 22 USDC
      await stVol.participateUnder(currentEpoch, ether("24"), { from: underUser1 }); // 24 USDC
      predictionCurrentUSDC = predictionCurrentUSDC.add(ether("67"));

      assert.equal(await stVol.treasuryAmount(), 0);
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), predictionCurrentUSDC.toString());

      // Epoch 3, Round 1 is Over (130 > 120)
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("31"), { from: overUser1 }); // 31 USDC
      await stVol.participateOver(currentEpoch, ether("32"), { from: overUser2 }); // 32 USDC
      await stVol.participateUnder(currentEpoch, ether("34"), { from: underUser1 }); // 34 USDC
      predictionCurrentUSDC = predictionCurrentUSDC.add(ether("97"));

      // Admin claim for Round 1
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), predictionCurrentUSDC.toString());
      assert.equal((await stVol.treasuryAmount()).toString(), ether("0.08").toString()); // 0.4 = 4 * 0.02 (losing side amount * commissionFee)

      const beforeOpBalance = (await mockUsdc.balanceOf(operator));
      const beforePVBalance = (await mockUsdc.balanceOf(participantVault));

      let tx = await stVol.claimTreasury({ from: admin }); // Success

      const afterOpBalance = (await mockUsdc.balanceOf(operator));
      const afterPVBalance = (await mockUsdc.balanceOf(participantVault));

      let { gasUsed } = tx.receipt;
      expectEvent(tx, "TreasuryClaim", { amount: ether("0.08") });
      assert.equal(await stVol.treasuryAmount(), 0); // Empty
      predictionCurrentUSDC = predictionCurrentUSDC.sub(ether("0.08"));
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), predictionCurrentUSDC.toString());
      assert.equal((afterOpBalance.add(afterPVBalance).sub(beforeOpBalance.add(beforePVBalance))).toString(), ether("0.08").toString());

      // Epoch 4, Round 2 is Over (140 > 130)
      await nextEpoch();
      const price140 = 14000000000; // $140
      await oracle.updateAnswer(price140); // Prevent house from winning
      await stVol.executeRound();
      assert.equal((await stVol.treasuryAmount()).toString(), ether("0.48").toString()); // 0.48 = 24 * 0.02

      // Epoch 5, Round 3 is Over (150 > 140)
      await nextEpoch();
      const price150 = 15000000000; // $150
      await oracle.updateAnswer(price150); // Prevent house from winning
      await stVol.executeRound();

      // Admin claim for Round 1 and 2
      assert.equal((await stVol.treasuryAmount()).toString(), ether("0.48").add(ether("0.68")).toString()); // 0.68 = 34 * 0.02
      tx = await stVol.claimTreasury({ from: admin }); // Success
      gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "TreasuryClaim", { amount: ether("1.16") }); // 5.8 = 0.48 + 0.68
      assert.equal(await stVol.treasuryAmount(), 0); // Empty
      predictionCurrentUSDC = predictionCurrentUSDC.sub(ether("1.16"));
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), predictionCurrentUSDC.toString());
    });

    it("Admin/Owner function work as expected", async () => {
      await stVol.pause({ from: admin });
      let tx = await stVol.setBufferAndIntervalSeconds("50", "100", { from: admin });

      expectEvent(tx, "NewBufferAndIntervalSeconds", { bufferSeconds: "50", intervalSeconds: "100" });

      await expectRevert(
        stVol.setBufferAndIntervalSeconds("100", "99", { from: admin }),
        "bufferSeconds must be inferior to intervalSeconds"
      );

      await expectRevert(
        stVol.setBufferAndIntervalSeconds("100", "100", { from: admin }),
        "bufferSeconds must be inferior to intervalSeconds"
      );

      tx = await stVol.setMinParticipateAmount("50", { from: admin });
      expectEvent(tx, "NewMinParticipateAmount", { minParticipateAmount: "50" });
      await expectRevert(stVol.setMinParticipateAmount("0", { from: admin }), "Must be superior to 0");

      tx = await stVol.setOperator(admin, { from: admin });
      expectEvent(tx, "NewOperatorAddress", { operator: admin });
      await expectRevert(stVol.setOperator(constants.ZERO_ADDRESS, { from: admin }), "Cannot be zero address");

      tx = await stVol.setOracle(oracle.address, { from: admin });
      expectEvent(tx, "NewOracle", { oracle: oracle.address });
      await expectRevert(stVol.setOracle(constants.ZERO_ADDRESS, { from: admin }), "Cannot be zero address");

      // Sanity checks for oracle interface implementation
      // EOA
      await expectRevert(stVol.setOracle(admin, { from: admin }), "function call to a non-contract account");
      // Other contract
      await expectRevert(
        stVol.setOracle(stVol.address, { from: admin }),
        "function selector was not recognized and there's no fallback function"
      );

      tx = await stVol.setOracleUpdateAllowance("30", { from: admin });
      expectEvent(tx, "NewOracleUpdateAllowance", { oracleUpdateAllowance: "30" });

      tx = await stVol.setCommissionfee("100", { from: admin });
      expectEvent(tx, "NewCommissionfee", { epoch: "0", commissionfee: "100" });

      await expectRevert(stVol.setCommissionfee("3000", { from: admin }), "Commission fee too high");

      tx = await stVol.setAdmin(owner, { from: owner });
      expectEvent(tx, "NewAdminAddress", { admin: owner });
      await expectRevert(stVol.setAdmin(constants.ZERO_ADDRESS, { from: owner }), "Cannot be zero address");
    });

    it("Should reject operator functions when not operator", async () => {
      await expectRevert(stVol.genesisStartRound({ from: admin }), "Not keeper/operator");
      await expectRevert(stVol.genesisOpenRound({ from: admin }), "Not keeper/operator");
      await expectRevert(stVol.executeRound({ from: admin }), "Not keeper/operator");
    });

    it("Should reject admin/owner functions when not admin/owner", async () => {
      await expectRevert(stVol.claimTreasury({ from: overUser1 }), "Not admin");
      await expectRevert(stVol.pause({ from: overUser1 }), "Not operator/admin");
      await stVol.pause({ from: admin });
      await expectRevert(stVol.unpause({ from: overUser1 }), "Not operator/admin");
      await expectRevert(stVol.setBufferAndIntervalSeconds("50", "100", { from: overUser1 }), "Not admin");
      await expectRevert(stVol.setMinParticipateAmount("0", { from: overUser1 }), "Not admin");
      await expectRevert(stVol.setOperator(underUser1, { from: overUser1 }), "Not admin");
      await expectRevert(stVol.setOracle(underUser1, { from: overUser1 }), "Not admin");
      await expectRevert(stVol.setOracleUpdateAllowance("0", { from: overUser1 }), "Not admin");
      await expectRevert(stVol.setCommissionfee("100", { from: overUser1 }), "Not admin");
      await expectRevert(stVol.unpause({ from: overUser1 }), "Not operator/admin");
      await stVol.unpause({ from: admin });
      await expectRevert(stVol.setAdmin(admin, { from: admin }), "Ownable: caller is not the owner");
      await expectRevert(stVol.setAdmin(overUser1, { from: overUser1 }), "Ownable: caller is not the owner");
    });

    it("Should reject admin/owner functions when not paused", async () => {
      await expectRevert(stVol.setBufferAndIntervalSeconds("50", "100", { from: admin }), "Pausable: not paused");
      await expectRevert(stVol.setMinParticipateAmount("0", { from: admin }), "Pausable: not paused");
      await expectRevert(stVol.setOracle(underUser1, { from: admin }), "Pausable: not paused");
      await expectRevert(stVol.setOracleUpdateAllowance("0", { from: admin }), "Pausable: not paused");
      await expectRevert(stVol.setCommissionfee("100", { from: admin }), "Pausable: not paused");
      await expectRevert(stVol.unpause({ from: admin }), "Pausable: not paused");
    });

    it("Should refund rewards", async () => {
      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // 1 USDC
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 }); // 2 USDC
      await stVol.participateUnder(currentEpoch, ether("4"), { from: underUser1 }); // 4 USDC

      assert.equal(await stVol.refundable(1, Position.Over, overUser1), false);
      assert.equal(await stVol.refundable(1, Position.Over, overUser2), false);
      assert.equal(await stVol.refundable(1, Position.Under, underUser1), false);
      assert.equal(await stVol.treasuryAmount(), 0);
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("7").toString());

      // Epoch 2
      await nextEpoch();
      await stVol.genesisStartRound();
      currentEpoch = await stVol.currentEpoch();

      assert.equal(await stVol.refundable(1, Position.Over, overUser1), false);
      assert.equal(await stVol.refundable(1, Position.Over, overUser2), false);
      assert.equal(await stVol.refundable(1, Position.Under, underUser1), false);

      // Epoch 3 (missed)
      await nextEpoch();

      // Epoch 4
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await expectRevert(stVol.executeRound(), "Can only start round within bufferSeconds");

      // Refund for Round 1
      assert.equal(await stVol.refundable(1, Position.Over, overUser1), true);
      assert.equal(await stVol.refundable(1, Position.Over, overUser2), true);
      assert.equal(await stVol.refundable(1, Position.Under, underUser1), true);

      let tx = await stVol.claim(1, Position.Over, { from: overUser1 }); // Success
      let { gasUsed } = tx.receipt;
      expectEvent(tx, "Claim", { sender: overUser1, epoch: new BN("1"), amount: ether("1") }); // 1, 100% of amount

      tx = await stVol.claim(1, Position.Over, { from: overUser2 }); // Success
      gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "Claim", { sender: overUser2, epoch: new BN(1), amount: ether("2") }); // 2, 100% of amount

      tx = await stVol.claim(1, Position.Under, { from: underUser1 }); // Success
      gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "Claim", { sender: underUser1, epoch: new BN(1), amount: ether("4") }); // 4, 100% of amount

      await expectRevert(stVol.claim(1, Position.Over, { from: overUser1 }), "Not eligible for refund");
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser2 }), "Not eligible for refund");
      await expectRevert(stVol.claim(1, Position.Under, { from: underUser1 }), "Not eligible for refund");

      // Treasury amount should be empty
      assert.equal(await stVol.treasuryAmount(), 0);
      assert.equal(await mockUsdc.balanceOf(stVol.address), 0);
    });

    it("Rejections for participate bulls/bears work as expected", async () => {
      // Epoch 0
      await expectRevert(stVol.participateOver("0", ether("1"), { from: overUser1 }), "Round not participable");
      await expectRevert(stVol.participateUnder("0", ether("1"), { from: overUser1 }), "Round not participable");
      await expectRevert(stVol.participateOver("1", ether("1"), { from: overUser1 }), "Participate is too early/late");
      await expectRevert(stVol.participateUnder("1", ether("1"), { from: overUser1 }), "Participate is too early/late");

      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();
      await expectRevert(stVol.participateOver("1", ether("101"), { from: overUser1 }), "transfer amount exceeds balance");
      await expectRevert(stVol.participateUnder("1", ether("101"), { from: underUser1 }), "transfer amount exceeds balance");
      await expectRevert(stVol.participateOver("2", ether("1"), { from: overUser1 }), "Participate is too early/late");
      await expectRevert(stVol.participateUnder("2", ether("1"), { from: overUser1 }), "Participate is too early/late");

      // Participate must be higher (or equal) than minParticipateAmount
      await expectRevert(
        stVol.participateUnder("1", ether("0.0000001"), { from: overUser1 }),
        "Participate amount must be greater than minParticipateAmount"
      );
      await expectRevert(
        stVol.participateOver("1", ether("0.0000001"), { from: overUser1 }),
        "Participate amount must be greater than minParticipateAmount"
      );
    });
    it("Rejections for genesis start and lock rounds work as expected", async () => {
      await expectRevert(
        stVol.executeRound(),
        "Can only run after genesisOpenRound and genesisStartRound is triggered"
      );

      // Epoch 1
      await stVol.genesisOpenRound();
      await expectRevert(stVol.genesisOpenRound(), "Can only run genesisOpenRound once");
      await expectRevert(stVol.genesisStartRound(), "Can only start round after startTimestamp");

      // Advance to next epoch
      await nextEpoch();
      await nextEpoch();

      await expectRevert(stVol.genesisStartRound(), "Can only start round within bufferSeconds");

      await expectRevert(
        stVol.executeRound(),
        "Can only run after genesisOpenRound and genesisStartRound is triggered"
      );

      // Cannot restart genesis round
      await expectRevert(stVol.genesisOpenRound(), "Can only run genesisOpenRound once");

      // Admin needs to pause, then unpause
      await stVol.pause({ from: admin });
      await stVol.unpause({ from: admin });

      // Prediction restart
      await stVol.genesisOpenRound();

      await nextEpoch();

      // Lock the round
      await stVol.genesisStartRound();
      await nextEpoch();
      await expectRevert(stVol.genesisStartRound(), "Can only run genesisStartRound once");

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await expectRevert(stVol.executeRound(), "Can only start round within bufferSeconds");
    });

    it("Should prevent betting when paused", async () => {
      await stVol.genesisOpenRound();
      await nextEpoch();
      await stVol.genesisStartRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await stVol.executeRound();

      const tx = await stVol.pause({ from: admin });
      expectEvent(tx, "Pause", { epoch: new BN(3) });
      await expectRevert(stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }), "Pausable: paused");
      await expectRevert(stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 }), "Pausable: paused");
      await expectRevert(stVol.claim(1, Position.Over, { from: overUser1 }), "Not eligible for claim"); // Success
    });

    it("Should prevent round operations when paused", async () => {
      await stVol.genesisOpenRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await stVol.genesisStartRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await stVol.executeRound();

      let tx = await stVol.pause({ from: admin });
      expectEvent(tx, "Pause", { epoch: new BN(3) });
      await expectRevert(stVol.executeRound(), "Pausable: paused");
      await expectRevert(stVol.genesisOpenRound(), "Pausable: paused");
      await expectRevert(stVol.genesisStartRound(), "Pausable: paused");

      // Unpause and resume
      await nextEpoch(); // Goes to next epoch block number, but doesn't increase currentEpoch
      tx = await stVol.unpause({ from: admin });
      expectEvent(tx, "Unpause", { epoch: new BN(3) }); // Although nextEpoch is called, currentEpoch doesn't change
      await stVol.genesisOpenRound(); // Success
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await stVol.genesisStartRound(); // Success
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await stVol.executeRound(); // Success
    });

    it("Should paginate user rounds", async () => {
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });
      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser2 });
      await stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 });

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await stVol.genesisStartRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });
      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser2 });
      await stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 });

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });
      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser2 });
      await stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 });

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });
      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser2 });

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await stVol.executeRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });

      // Get by page size of 2
      const pageSize = 2;

      assertBNArray((await stVol.getUserRounds(overUser1, 0, 5))[0], [1, 2, 3, 4, 5]);

      let result = await stVol.getUserRounds(overUser1, 0, pageSize);
      let epochData = result[0];
      let overPositionData = result[1];
      let underPositionData = result[2];
      let cursor = result[3];

      assertBNArray(epochData, [1, 2]);
      assert.includeOrderedMembers(overPositionData[0], ["0", "1000000000000000000", false]);
      assert.includeOrderedMembers(overPositionData[1], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 2);

      result = await stVol.getUserRounds(overUser1, cursor, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, [3, 4]);
      assert.includeOrderedMembers(overPositionData[0], ["0", "1000000000000000000", false]);
      assert.includeOrderedMembers(overPositionData[1], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 4);

      result = await stVol.getUserRounds(overUser1, cursor, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, [5]);
      assert.includeOrderedMembers(overPositionData[0], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 5);

      result = await stVol.getUserRounds(overUser1, cursor, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, []);
      assert.isEmpty(overPositionData);
      assert.equal(cursor, 5);

      assertBNArray((await stVol.getUserRounds(overUser2, 0, 4))[0], [1, 2, 3, 4]);
      result = await stVol.getUserRounds(overUser2, 0, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, [1, 2]);
      assert.includeOrderedMembers(overPositionData[0], ["0", "1000000000000000000", false]);
      assert.includeOrderedMembers(overPositionData[1], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 2);

      result = await stVol.getUserRounds(overUser2, cursor, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, [3, 4]);
      assert.includeOrderedMembers(overPositionData[0], ["0", "1000000000000000000", false]);
      assert.includeOrderedMembers(overPositionData[1], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 4);

      result = await stVol.getUserRounds(overUser2, cursor, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, []);
      assert.isEmpty(overPositionData);
      assert.equal(cursor, 4);

      assertBNArray((await stVol.getUserRounds(underUser1, 0, 3))[0], [1, 2, 3]);
      result = await stVol.getUserRounds(underUser1, 0, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, [1, 2]);
      assert.includeOrderedMembers(underPositionData[0], ["1", "1000000000000000000", false]);
      assert.includeOrderedMembers(underPositionData[1], ["1", "1000000000000000000", false]);
      assert.equal(cursor, 2);

      result = await stVol.getUserRounds(underUser1, cursor, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, [3]);
      assert.includeOrderedMembers(underPositionData[0], ["1", "1000000000000000000", false]);
      assert.equal(cursor, 3);

      result = await stVol.getUserRounds(underUser1, cursor, pageSize);
      (epochData = result[0]), (overPositionData = result[1]), (underPositionData = result[2]), (cursor = result[3]);
      assertBNArray(epochData, []);
      assert.isEmpty(overPositionData);
      assert.equal(cursor, 3);
    });
    it("recoverToken function work as expected", async () => {
      await stVol.genesisOpenRound();
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });
      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser2 });
      await stVol.participateUnder(currentEpoch, ether("1"), { from: underUser1 });
      assert.equal(await mockUsdc.balanceOf(stVol.address), ether("3").toString());
      await expectRevert(
        stVol.recoverToken(mockUsdc.address, ether("1"), { from: owner }),
        "Cannot be prediction token address"
      );

      const randomToken = await MockERC20.new("Random Token", "RT", _totalInitSupply);
      await randomToken.mintTokens(ether("100"), { from: overUser1 });
      assert.equal(await randomToken.balanceOf(overUser1), ether("100").toString());
      await randomToken.transfer(stVol.address, ether("66"), { from: overUser1 });
      assert.equal(await randomToken.balanceOf(stVol.address), ether("66").toString());
      const tx = await stVol.recoverToken(randomToken.address, ether("66"), { from: owner });
      expectEvent(tx, "TokenRecovery", { token: randomToken.address, amount: ether("66") });
      assert.equal(await randomToken.balanceOf(stVol.address), 0);
      assert.equal(await randomToken.balanceOf(owner), ether("66").toString());
    });
  }
);