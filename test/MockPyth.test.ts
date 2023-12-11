import { time } from "@openzeppelin/test-helpers";
import { assert } from "chai";
import { artifacts, contract } from "hardhat";

const MockPythPrice = artifacts.require("MockPyth");
contract("MockPythPrice", ([operator, admin]) => {
    const priceId = '0x000000000000000000000000000000000000000000000000000000000000abcd';
    const INTERVAL_SECONDS = 100;
    const FIRST_PRICE = 100000;

    let pyth: any;
    beforeEach(async () => {
        const _validTimePeriod = 60;
        const _singleUpdateFeeInWei = 1;

        pyth = await MockPythPrice.new(_validTimePeriod, _singleUpdateFeeInWei);
    });

    it("createPriceFeedUpdateData", async () => {
        // Manual block calculation
        const currentTimestamp = (await time.latest()).toNumber();
        console.log("current time is ", currentTimestamp);

        const updateData = await pyth.createPriceFeedUpdateData(priceId, FIRST_PRICE, 10 * FIRST_PRICE, -5, FIRST_PRICE, 10 * FIRST_PRICE, currentTimestamp);
        console.log("updateData is ", updateData);

        const requiredFee = await pyth.getUpdateFee([updateData]);
        console.log("requiredFee is ", requiredFee);

        await pyth.updatePriceFeeds([updateData], { value: requiredFee });
        const priceInfo = await pyth.getPrice(priceId);
        assert.equal(priceInfo.price, FIRST_PRICE);
        assert.equal(priceInfo.publishTime, currentTimestamp);

        // await time.increaseTo(currentTimestamp + INTERVAL_SECONDS);
        // const nextTimestamp = (await time.latest()).toNumber();
        // console.log("next current time:%s", nextTimestamp);

        await pyth.parsePriceFeedUpdates([updateData], [priceId], currentTimestamp, currentTimestamp + 10, { value: requiredFee });
        const priceInfo02 = await pyth.getPrice(priceId);
        console.log('parsePriceFeedUpdates is ', priceInfo02)
        console.log(priceInfo02)
    });
});