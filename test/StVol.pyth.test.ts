import { ethers, artifacts, contract } from "hardhat";
import { assert } from "chai";
import { BN, constants, expectEvent, expectRevert, time, ether, balance } from "@openzeppelin/test-helpers";

const StVol = artifacts.require("StVolUpDown");
const Pyth = artifacts.require("MockPyth");
const MockERC20 = artifacts.require("./utils/MockERC20.sol");

const GAS_PRICE = 8000000000; // hardhat default
// BLOCK_COUNT_MULTPLIER: Only for test, because testing trx causes block to increment which exceeds blockBuffer time checks
// Note that the higher this value is, the slower the test will run
const BLOCK_COUNT_MULTPLIER = 5;
const DECIMALS = 8; // Chainlink default for ETH/USD
const INITIAL_PRICE = 10000000000; // $100, 8 decimal places
const INTERVAL_SECONDS = 86400;
const BUFFER_SECONDS = 600;
const MIN_AMOUNT = 1000000 // 1 USDC
const UPDATE_ALLOWANCE = 30 * BLOCK_COUNT_MULTPLIER; // 30s * multiplier
const INITIAL_REWARD_RATE = 0.9; // 90%
const INITIAL_COMMISSION_RATE = 0.02; // 2%
const INITIAL_OPERATE_RATE = 0.3; // 30%
const INITIAL_PARTICIPATE_RATE = 0.7; // 70%
const MULTIPLIER = 10000;
const FIRST_PRICE = 100000;
const SECOND_PRICE = 120000;
const THIRD_PRICE = 150000;

// Enum: 0 = Over, 1 = Under
const Position = {
  Over: "0",
  Under: "1",
};
const LimitOrderStatus = {
  Undeclared: "0",
  Approve: "1",
  Cancelled: "2"

}

const calcGasCost = (gasUsed: number) => new BN(GAS_PRICE * gasUsed);

const assertBNArray = (arr1: any[], arr2: any | any[]) => {
  assert.equal(arr1.length, arr2.length);
  arr1.forEach((n1, index) => {
    assert.equal(n1.toString(), new BN(arr2[index]).toString());
  });
};

contract(
  "StVolUpDown",
  ([operator, admin, owner, overUser1, overUser2, overUser3, underUser1, underUser2, underUser3, participantVault, overLimitUser1, overLimitUser2, overLimitUser3, underLimitUser1, underLimitUser2, underLimitUser3]) => {
    // mock usdc total supply
    const _totalInitSupply = ether("10000000000");
    let currentEpoch: any;
    let pyth: any;
    let stVol: any;
    let mockUsdc: any;
    const priceId = '0x000000000000000000000000000000000000000000000000000000000000abcd';
    const validTimePeriod = 60;
    const singleUpdateFeeInWei = 1;

    async function nextEpoch(currentTimestamp: number) {
      await time.increaseTo(currentTimestamp + INTERVAL_SECONDS); // Elapse 20 seconds
    }

    beforeEach(async () => {
      // Deploy USDC
      mockUsdc = await MockERC20.new("Mock USDC", "USDC", _totalInitSupply);
      // mint usdc for test accounts
      const MintAmount = ether("100"); // 100 USDC

      mockUsdc.mintTokens(MintAmount, { from: overUser1 });
      mockUsdc.mintTokens(MintAmount, { from: overUser2 });
      mockUsdc.mintTokens(MintAmount, { from: overUser3 });
      mockUsdc.mintTokens(MintAmount, { from: overLimitUser1 });
      mockUsdc.mintTokens(MintAmount, { from: overLimitUser2 });
      mockUsdc.mintTokens(MintAmount, { from: overLimitUser3 });
      mockUsdc.mintTokens(MintAmount, { from: underLimitUser1 });
      mockUsdc.mintTokens(MintAmount, { from: underLimitUser2 });
      mockUsdc.mintTokens(MintAmount, { from: underLimitUser3 });
      mockUsdc.mintTokens(MintAmount, { from: underUser1 });
      mockUsdc.mintTokens(MintAmount, { from: underUser2 });
      mockUsdc.mintTokens(MintAmount, { from: underUser3 });

      pyth = await Pyth.new(validTimePeriod, singleUpdateFeeInWei);

      stVol = await StVol.new(
        mockUsdc.address,
        pyth.address,
        admin,
        operator,
        participantVault,
        String(INITIAL_COMMISSION_RATE * 10000),
        priceId,
        { from: owner }
      );
      // approve usdc amount for stVol contract
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overUser1 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overUser2 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overUser3 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underUser1 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underUser2 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underUser3 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overLimitUser1 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overLimitUser2 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: overLimitUser3 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underLimitUser1 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underLimitUser2 });
      mockUsdc.approve(stVol.address, ethers.constants.MaxUint256, { from: underLimitUser3 });
    });

    it("Initialize", async () => {
      assert.equal(await mockUsdc.balanceOf(stVol.address), 0);
      assert.equal(await stVol.currentEpoch(), 0);
      assert.equal(await stVol.adminAddress(), admin);
      assert.equal(await stVol.treasuryAmount(), 0);
      assert.equal(await stVol.minParticipateAmount(), MIN_AMOUNT.toString());
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
      let tx = await stVol.genesisOpenRound(currentTimestamp);
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
      // update pythPrice updateData
      let updateData = await pyth.createPriceFeedUpdateData(priceId, FIRST_PRICE, 10 * FIRST_PRICE, -5, FIRST_PRICE, 10 * FIRST_PRICE, currentTimestamp);
      let requiredFee = await pyth.getUpdateFee([updateData]);

      await pyth.updatePriceFeeds([updateData], { value: requiredFee });

      // Epoch 2: Lock genesis round 1 and starts round 2
      tx = await stVol.genesisStartRound([updateData], currentTimestamp, false, { value: requiredFee });

      expectEvent(tx, "StartRound", {
        epoch: new BN(1),
        price: new BN(FIRST_PRICE),
      });

      expectEvent(tx, "OpenRound", { epoch: new BN(2) });
      assert.equal(await stVol.currentEpoch(), 2);

      // Lock round 1
      assert.equal(await stVol.genesisOpenOnce(), true);
      assert.equal(await stVol.genesisStartOnce(), true);
      assert.equal((await stVol.rounds(1)).startPrice, FIRST_PRICE);

      // Start round 2
      assert.equal((await stVol.rounds(2)).openTimestamp, currentTimestamp);
      assert.equal((await stVol.rounds(2)).startTimestamp, currentTimestamp + INTERVAL_SECONDS);
      assert.equal((await stVol.rounds(2)).closeTimestamp, currentTimestamp + 2 * INTERVAL_SECONDS);
      assert.equal((await stVol.rounds(2)).epoch, 2);
      assert.equal((await stVol.rounds(2)).totalAmount, 0);

      // Elapse 20 blocks
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);
      // update pythPrice updateData
      updateData = await pyth.createPriceFeedUpdateData(priceId, SECOND_PRICE, 10 * SECOND_PRICE, -5, SECOND_PRICE, 10 * SECOND_PRICE, currentTimestamp);
      requiredFee = await pyth.getUpdateFee([updateData]);

      await pyth.updatePriceFeeds([updateData], { value: requiredFee });

      // Epoch 3: End genesis round 1, locks round 2, starts round 3
      tx = await stVol.executeRound([updateData], currentTimestamp, false, { value: requiredFee });

      expectEvent(tx, "EndRound", {
        epoch: new BN(1),
        price: new BN(SECOND_PRICE),
      });

      expectEvent(tx, "StartRound", {
        epoch: new BN(2),
        price: new BN(SECOND_PRICE),
      });

      expectEvent(tx, "OpenRound", { epoch: new BN(3) });
      assert.equal(await stVol.currentEpoch(), 3);

      // End round 1
      assert.equal((await stVol.rounds(1)).closePrice, SECOND_PRICE);

      // Lock round 2
      assert.equal((await stVol.rounds(2)).startPrice, SECOND_PRICE);
    });
    it("Should start genesis rounds with parsePriceFeedUpdates in pyth (round 1, round 2, round 3)", async () => {
      // Manual block calculation
      let currentTimestamp = (await time.latest()).toNumber();

      // Epoch 0
      assert.equal((await time.latest()).toNumber(), currentTimestamp);
      assert.equal(await stVol.currentEpoch(), 0);

      // Epoch 1: Start genesis round 1
      let tx = await stVol.genesisOpenRound(currentTimestamp);
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
      // update pythPrice updateData
      let updateData = await pyth.createPriceFeedUpdateData(priceId, FIRST_PRICE, 10 * FIRST_PRICE, -5, FIRST_PRICE, 10 * FIRST_PRICE, currentTimestamp);
      let requiredFee = await pyth.getUpdateFee([updateData]);

      await pyth.updatePriceFeeds([updateData], { value: requiredFee });

      // Epoch 2: Lock genesis round 1 and starts round 2
      tx = await stVol.genesisStartRound([updateData], currentTimestamp, true, { value: requiredFee });

      expectEvent(tx, "StartRound", {
        epoch: new BN(1),
        price: new BN(FIRST_PRICE),
      });

      expectEvent(tx, "OpenRound", { epoch: new BN(2) });
      assert.equal(await stVol.currentEpoch(), 2);

      // Lock round 1
      assert.equal(await stVol.genesisOpenOnce(), true);
      assert.equal(await stVol.genesisStartOnce(), true);
      assert.equal((await stVol.rounds(1)).startPrice, FIRST_PRICE);

      // Start round 2
      assert.equal((await stVol.rounds(2)).openTimestamp, currentTimestamp);
      assert.equal((await stVol.rounds(2)).startTimestamp, currentTimestamp + INTERVAL_SECONDS);
      assert.equal((await stVol.rounds(2)).closeTimestamp, currentTimestamp + 2 * INTERVAL_SECONDS);
      assert.equal((await stVol.rounds(2)).epoch, 2);
      assert.equal((await stVol.rounds(2)).totalAmount, 0);

      // Elapse 20 blocks
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);
      // update pythPrice updateData
      updateData = await pyth.createPriceFeedUpdateData(priceId, SECOND_PRICE, 10 * SECOND_PRICE, -5, SECOND_PRICE, 10 * SECOND_PRICE, currentTimestamp);
      requiredFee = await pyth.getUpdateFee([updateData]);

      await pyth.updatePriceFeeds([updateData], { value: requiredFee });

      // Epoch 3: End genesis round 1, locks round 2, starts round 3
      tx = await stVol.executeRound([updateData], currentTimestamp, true, { value: 100000 });

      expectEvent(tx, "EndRound", {
        epoch: new BN(1),
        price: new BN(SECOND_PRICE),
      });

      expectEvent(tx, "StartRound", {
        epoch: new BN(2),
        price: new BN(SECOND_PRICE),
      });

      expectEvent(tx, "OpenRound", { epoch: new BN(3) });
      assert.equal(await stVol.currentEpoch(), 3);

      // End round 1
      assert.equal((await stVol.rounds(1)).closePrice, SECOND_PRICE);

      // Lock round 2
      assert.equal((await stVol.rounds(2)).startPrice, SECOND_PRICE);
    });

    it("Should record data and user participate", async () => {
      let currentTimestamp = (await time.latest()).toNumber();

      // Epoch 1
      await stVol.genesisOpenRound(currentTimestamp);
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
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      await stVol.genesisStartRound(new BN(INITIAL_PRICE), currentTimestamp); // For round 1
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
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      await stVol.executeRound(new BN(INITIAL_PRICE), currentTimestamp);
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
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);
      await stVol.executeRound(new BN(INITIAL_PRICE), currentTimestamp);
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

    it("[2]", async () => {
      let currentTimestamp = 1704078000;
      await time.increaseTo(currentTimestamp);

      // Epoch 1
      await stVol.genesisOpenRound(currentTimestamp);
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 }); // 1.1 USDC
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 }); // 1.2 USDC
      await stVol.participateUnder(currentEpoch, ether("6"), { from: underUser1 }); // 1.4 USDC

      // place limit order
      await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2.5 * MULTIPLIER), { from: overLimitUser1 }); // 1.1 USDC

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("10").toString()); // 3.7 USDC

      console.log(ether("9").toString())
      console.log(ether("3").toString())
      assert.equal((await stVol.rounds(1)).totalAmount, ether("9").toString()); // 3.7 USDC
      assert.equal((await stVol.rounds(1)).overAmount, ether("3").toString()); // 2.3 USDC
      assert.equal((await stVol.rounds(1)).underAmount, ether("6").toString()); // 1.4 USDC
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).amount, ether("1").toString());
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).amount, ether("2").toString());
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).position, Position.Under);
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).amount, ether("6").toString());
      assertBNArray((await stVol.getUserRounds(overUser1, 0, 1))[0], [1]);
      assertBNArray((await stVol.getUserRounds(overUser2, 0, 1))[0], [1]);
      assertBNArray((await stVol.getUserRounds(underUser1, 0, 1))[0], [1]);
      assert.equal(await stVol.getUserRoundsLength(overUser1), 1);

      // Epoch 2
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      await stVol.genesisStartRound(new BN(INITIAL_PRICE), currentTimestamp); // For round 1
      currentEpoch = await stVol.currentEpoch();

      assert.equal((await stVol.rounds(1)).totalAmount, ether("10").toString());
      assert.equal((await stVol.rounds(1)).overAmount, ether("4").toString());
      assert.equal((await stVol.rounds(1)).underAmount, ether("6").toString());

      // execute limit order 

    });
    it("[3]", async () => {
      let currentTimestamp = 1704078000;
      await time.increaseTo(currentTimestamp);

      // Epoch 1
      await stVol.genesisOpenRound(currentTimestamp);
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 });
      await stVol.participateUnder(currentEpoch, ether("6"), { from: underUser1 });

      // place limit order
      await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      await stVol.participateLimitOver(currentEpoch, ether("2"), new BN(2.1 * MULTIPLIER), { from: overLimitUser2 }); // payout:2.1x
      await stVol.participateLimitOver(currentEpoch, ether("2"), new BN(1.1 * MULTIPLIER), { from: overLimitUser3 }); // payout:1.1x
      await stVol.participateLimitUnder(currentEpoch, ether("2"), new BN(1.1 * MULTIPLIER), { from: underLimitUser1 }); // payout:1.1x

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("16").toString());

      assert.equal((await stVol.rounds(1)).totalAmount, ether("9").toString()); // 3.7 USDC
      assert.equal((await stVol.rounds(1)).overAmount, ether("3").toString()); // 2.3 USDC
      assert.equal((await stVol.rounds(1)).underAmount, ether("6").toString()); // 1.4 USDC
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).amount, ether("1").toString());
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).amount, ether("2").toString());
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).position, Position.Under);
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).amount, ether("6").toString());
      // assertBNArray((await stVol.getUserRounds(overUser1, 0, 1))[0], [1]);
      // assertBNArray((await stVol.getUserRounds(overUser2, 0, 1))[0], [1]);
      // assertBNArray((await stVol.getUserRounds(underUser1, 0, 1))[0], [1]);
      // assert.equal(await stVol.getUserRoundsLength(overUser1), 1);

      // Epoch 2
      // execute limit order 
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      await stVol.genesisStartRound(new BN(INITIAL_PRICE), currentTimestamp); // For round 1
      currentEpoch = await stVol.currentEpoch();

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("14").toString());
      assert.equal((await stVol.rounds(1)).totalAmount, ether("14").toString());
      assert.equal((await stVol.rounds(1)).overAmount, ether("6").toString());
      assert.equal((await stVol.rounds(1)).underAmount, ether("8").toString());
    });
    it("[4]", async () => {
      let currentTimestamp = 1704078000;
      await time.increaseTo(currentTimestamp);

      // Epoch 1
      await stVol.genesisOpenRound(currentTimestamp);
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 });
      await stVol.participateUnder(currentEpoch, ether("6"), { from: underUser1 });

      // place limit order
      await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      await stVol.participateLimitOver(currentEpoch, ether("2"), new BN(2.1 * MULTIPLIER), { from: overLimitUser2 }); // payout:2.1x
      await stVol.participateLimitOver(currentEpoch, ether("2"), new BN(1.1 * MULTIPLIER), { from: overLimitUser3 }); // payout:1.1x
      await stVol.participateLimitUnder(currentEpoch, ether("2"), new BN(1.1 * MULTIPLIER), { from: underLimitUser1 }); // payout:1.1x
      await stVol.participateLimitUnder(currentEpoch, ether("2"), new BN(1.1 * MULTIPLIER), { from: underLimitUser1 }); // payout:1.1x

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("18").toString());

      assert.equal((await stVol.rounds(1)).totalAmount, ether("9").toString());
      assert.equal((await stVol.rounds(1)).overAmount, ether("3").toString());
      assert.equal((await stVol.rounds(1)).underAmount, ether("6").toString());
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).amount, ether("1").toString());
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).amount, ether("2").toString());
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).position, Position.Under);
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).amount, ether("6").toString());

      // Epoch 2
      // execute limit order 
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      await stVol.genesisStartRound(new BN(INITIAL_PRICE), currentTimestamp); // For round 1
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      await stVol.participateLimitUnder(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: underLimitUser1 }); // payout:2x
      await stVol.participateLimitUnder(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: underLimitUser1 }); // payout:2x
      console.log((await mockUsdc.balanceOf(overLimitUser1)).toString());

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("22").toString());
      assert.equal((await stVol.rounds(1)).totalAmount, ether("18").toString());
      assert.equal((await stVol.rounds(1)).overAmount, ether("8").toString());
      assert.equal((await stVol.rounds(1)).underAmount, ether("10").toString());

      assert.equal((await stVol.rounds(2)).totalAmount, ether("0").toString());
      assert.equal((await stVol.rounds(2)).overAmount, ether("0").toString());
      assert.equal((await stVol.rounds(2)).underAmount, ether("0").toString());

      // Epoch 3
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      await stVol.executeRound(new BN(INITIAL_PRICE), currentTimestamp);
      currentEpoch = await stVol.currentEpoch();
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("18").toString());
      assert.equal((await mockUsdc.balanceOf(overLimitUser1)).toString(), ether("99").toString());
    });
    it("[5]", async () => {
      let currentTimestamp = 1704078000;
      await time.increaseTo(currentTimestamp);

      // Epoch 1
      await stVol.genesisOpenRound(currentTimestamp);
      currentEpoch = await stVol.currentEpoch();

      await stVol.participateOver(currentEpoch, ether("1"), { from: overUser1 });
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser2 });
      await stVol.participateUnder(currentEpoch, ether("6"), { from: underUser1 });

      // place limit order
      await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      await stVol.participateLimitOver(currentEpoch, ether("2"), new BN(2.1 * MULTIPLIER), { from: overLimitUser2 }); // payout:2.1x
      await stVol.participateLimitOver(currentEpoch, ether("2"), new BN(1.1 * MULTIPLIER), { from: overLimitUser3 }); // payout:1.1x
      await stVol.participateLimitUnder(currentEpoch, ether("2"), new BN(1.1 * MULTIPLIER), { from: underLimitUser1 }); // payout:1.1x
      await stVol.participateLimitUnder(currentEpoch, ether("2"), new BN(1.1 * MULTIPLIER), { from: underLimitUser1 }); // payout:1.1x

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("18").toString());

      assert.equal((await stVol.rounds(1)).totalAmount, ether("9").toString());
      assert.equal((await stVol.rounds(1)).overAmount, ether("3").toString());
      assert.equal((await stVol.rounds(1)).underAmount, ether("6").toString());
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser1)).amount, ether("1").toString());
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).position, Position.Over);
      assert.equal((await stVol.ledger(1, Position.Over, overUser2)).amount, ether("2").toString());
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).position, Position.Under);
      assert.equal((await stVol.ledger(1, Position.Under, underUser1)).amount, ether("6").toString());

      // Epoch 2
      // execute limit order 
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      await stVol.genesisStartRound(new BN(INITIAL_PRICE), currentTimestamp); // For round 1
      currentEpoch = await stVol.currentEpoch();
      await stVol.participateOver(currentEpoch, ether("2"), { from: overUser1 });

      await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      await stVol.participateLimitUnder(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: underLimitUser1 }); // payout:2x
      await stVol.participateLimitUnder(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: underLimitUser1 }); // payout:2x
      console.log((await mockUsdc.balanceOf(overLimitUser1)).toString());

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("24").toString());
      assert.equal((await stVol.rounds(1)).totalAmount, ether("18").toString());
      assert.equal((await stVol.rounds(1)).overAmount, ether("8").toString());
      assert.equal((await stVol.rounds(1)).underAmount, ether("10").toString());

      assert.equal((await stVol.rounds(2)).totalAmount, ether("2").toString());
      assert.equal((await stVol.rounds(2)).overAmount, ether("2").toString());
      assert.equal((await stVol.rounds(2)).underAmount, ether("0").toString());

      // Epoch 3
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      await stVol.executeRound(new BN(INITIAL_PRICE), currentTimestamp);
      currentEpoch = await stVol.currentEpoch();
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("22").toString());
      assert.equal((await stVol.rounds(2)).totalAmount, ether("4").toString());
      assert.equal((await stVol.rounds(2)).overAmount, ether("2").toString());
      assert.equal((await stVol.rounds(2)).underAmount, ether("2").toString());
    });

    it("Should place limit order", async () => {
      let currentTimestamp = (await time.latest()).toNumber();

      // Epoch 1
      await stVol.genesisOpenRound(currentTimestamp);
      currentEpoch = await stVol.currentEpoch();
      await stVol.participateUnder(currentEpoch, ether("10"), { from: underUser1 });

      // place limit order
      let limitOrderTx = await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x

      let expectedTimestamp = (await time.latest()).toNumber();
      expectEvent(limitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(1),
        sender: overLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(0),
        status: new BN(0)
      });

      limitOrderTx = await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      expectedTimestamp = (await time.latest()).toNumber();
      expectEvent(limitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(2),
        sender: overLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(0),
        status: new BN(0)
      });

      limitOrderTx = await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      expectedTimestamp = (await time.latest()).toNumber();
      expectEvent(limitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(3),
        sender: overLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(0),
        status: new BN(0)
      });
      limitOrderTx = await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      expectedTimestamp = (await time.latest()).toNumber();
      expectEvent(limitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(4),
        sender: overLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(0),
        status: new BN(0)
      });
      limitOrderTx = await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x
      expectedTimestamp = (await time.latest()).toNumber();
      expectEvent(limitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(5),
        sender: overLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(0),
        status: new BN(0)
      });


      limitOrderTx = await stVol.participateLimitUnder(currentEpoch, ether("1"), new BN(5 * MULTIPLIER), { from: underLimitUser1 }); // payout:5x
      expectedTimestamp = (await time.latest()).toNumber();
      expectEvent(limitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(6),
        sender: underLimitUser1,
        payout: new BN(5 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(1),
        status: new BN(0)
      });

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("16").toString());

      // Epoch 2
      // execute limit order 
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);
      // update pythPrice updateData
      let updateData = await pyth.createPriceFeedUpdateData(priceId, FIRST_PRICE, 10 * FIRST_PRICE, -5, FIRST_PRICE, 10 * FIRST_PRICE, currentTimestamp);
      let requiredFee = await pyth.getUpdateFee([updateData]);
      await pyth.updatePriceFeeds([updateData], { value: requiredFee });

      await stVol.genesisStartRound([updateData], currentTimestamp, true, { value: requiredFee }); // For round 1
      currentEpoch = await stVol.currentEpoch();

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("15").toString());
      assert.equal((await stVol.rounds(1)).totalAmount, ether("15").toString());
      assert.equal((await stVol.rounds(1)).overAmount, ether("5").toString());
      assert.equal((await stVol.rounds(1)).underAmount, ether("10").toString());

      // Epoch 3
      // execute limit order 
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);
      const price130 = 13000000000; // $130
      // update pythPrice updateData
      updateData = await pyth.createPriceFeedUpdateData(priceId, price130, 10 * price130, -5, price130, 10 * price130, currentTimestamp);
      requiredFee = await pyth.getUpdateFee([updateData]);
      await pyth.updatePriceFeeds([updateData], { value: requiredFee });


      await stVol.executeRound([updateData], currentTimestamp, false, { value: requiredFee }); // For round 1
      currentEpoch = await stVol.currentEpoch();

      assert.equal(await stVol.claimable(1, Position.Over, overLimitUser1), true);
      assert.equal(await stVol.claimable(1, Position.Under, underUser1), false);

      // Claim for Round 1: Total rewards = 6.92, Over = 3, Under = 4
      let tx = await stVol.claim(1, Position.Over, { from: overLimitUser1 }); // Success
      expectEvent(tx, "Claim", { sender: overLimitUser1, epoch: new BN("1"), amount: ether("14.8") });
      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("0.2").toString());
    });
    it.only("Should cancel placed limit order", async () => {
      let currentTimestamp = (await time.latest()).toNumber();

      // Epoch 1
      await stVol.genesisOpenRound(currentTimestamp);
      currentEpoch = await stVol.currentEpoch();

      // place over limit order
      let limitOrderTx = await stVol.participateLimitOver(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: overLimitUser1 }); // payout:2x

      let expectedTimestamp = (await time.latest()).toNumber();
      expectEvent(limitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(1),
        sender: overLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(Position.Over),
        status: new BN(LimitOrderStatus.Undeclared)
      });

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("1").toString());

      let cancelLimitOrderTx = await stVol.cancelLimitOrder(new BN(1), currentEpoch, Position.Over, { from: overLimitUser1 });
      expectEvent(cancelLimitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(1),
        sender: overLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(Position.Over),
        status: new BN(LimitOrderStatus.Cancelled)
      });

      // place under limit order
      limitOrderTx = await stVol.participateLimitUnder(currentEpoch, ether("1"), new BN(2 * MULTIPLIER), { from: underLimitUser1 }); // payout:2x
      expectedTimestamp = (await time.latest()).toNumber();
      expectEvent(limitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(2),
        sender: underLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(Position.Under),
        status: new BN(LimitOrderStatus.Undeclared)
      });

      assert.equal((await mockUsdc.balanceOf(stVol.address)).toString(), ether("1").toString());
      cancelLimitOrderTx = await stVol.cancelLimitOrder(new BN(2), currentEpoch, Position.Under, { from: underLimitUser1 });
      expectEvent(cancelLimitOrderTx, "ParticipateLimitOrder", {
        idx: new BN(2),
        sender: underLimitUser1,
        payout: new BN(2 * MULTIPLIER),
        amount: ether("1"),
        placeTimestamp: new BN(expectedTimestamp),
        position: new BN(Position.Under),
        status: new BN(LimitOrderStatus.Cancelled)
      });

    });
  }
);