import { expect } from "chai";
import { Contract, BigNumber, utils } from "ethers";
import { ethers } from "hardhat";
import Web3 from "web3";

interface Order {
    user: string;
    payout: BigNumber;
    amount: BigNumber;
}

const queueStartElement =
    "0x0000000000000000000000000000000000000000000000000000000000000001";
const queueLastElement =
    "0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001";
const QUEUE_END =
    "0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001";

const BYTES32_ZERO = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    payout: BigNumber.from(0),
    amount: BigNumber.from(0)
});
const BYTES32_ONE = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    payout: BigNumber.from(2),
    amount: BigNumber.from(2)
});
const BYTES32_ONE_DIFFERENT = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    payout: BigNumber.from(3),
    amount: BigNumber.from(3)
});
const BYTES32_ONE_BEST_USER = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    payout: BigNumber.from(2),
    amount: BigNumber.from(2)
});
const BYTES32_ONE_BEST_AMOUNT = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    payout: BigNumber.from(1),
    amount: BigNumber.from(1)
});
const BYTES32_TWO = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    payout: BigNumber.from(3),
    amount: BigNumber.from(8)
});
const BYTES32_THREE = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    payout: BigNumber.from(4),
    amount: BigNumber.from(6)
});
const BYTES32_FOUR = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    amount: BigNumber.from(8),
    payout: BigNumber.from(2)
});
const BYTES32_FIVE = encodeOrder({
    user: "0x0000000000000000000000000000000000000000",
    amount: BigNumber.from(10),
    payout: BigNumber.from(2)
});

async function getSetContent(set: Contract) {
    const result = [];
    if (!(await set.isEmpty())) {
        const last_element = queueLastElement;
        let current = await set.first();
        while (current != last_element) {
            result.push(current);
            current = await set.next(current);
        }
    }
    return result;
}

describe("IterableOrderedOrderSet", function () {
    let set: Contract;
    beforeEach(async () => {
        const IterableOrderedOrderSetWrapper = await ethers.getContractFactory(
            "IterableOrderedOrderSetWrapper",
        );

        set = await IterableOrderedOrderSetWrapper.deploy();
        await set.initializeEmptyList();
    });

    it("should contain the added values", async () => {
        expect(await getSetContent(set)).to.be.empty;
        expect(await set.contains(BYTES32_ONE)).to.equal(false);

        expect(await set.callStatic.insert(BYTES32_ONE)).to.equal(true);
        await set.insert(BYTES32_ONE);
        expect(await set.contains(BYTES32_ONE)).to.equal(true);

        expect(await getSetContent(set)).to.eql([BYTES32_ONE]);
    });

    it("should insert the same value only once", async () => {
        expect(await set.callStatic.insert(BYTES32_ONE)).to.equal(true);
        await set.insert(BYTES32_ONE);
        expect(await getSetContent(set)).to.eql([BYTES32_ONE]);

        expect(await set.callStatic.insert(BYTES32_ONE)).to.equal(false);
        await set.insert(BYTES32_ONE);
        expect(await getSetContent(set)).to.eql([BYTES32_ONE]);
    });

    it("should return first", async () => {
        await set.insert(BYTES32_ONE);
        expect(await set.first()).to.equal(BYTES32_ONE);
    });

    it("should allow to iterate over content and check order - part 1", async () => {
        await set.insert(BYTES32_ONE);
        await set.insert(BYTES32_TWO);
        await set.insert(BYTES32_THREE);
        await set.insert(BYTES32_ONE_BEST_USER);
        await set.insert(BYTES32_ONE_BEST_AMOUNT);

        const first = await set.first();
        const second = await set.next(first);
        const third = await set.next(second);
        const fourth = await set.next(third);
        const fifth = await set.next(fourth);

        expect(first).to.equal(BYTES32_ONE_BEST_AMOUNT);
        expect(second).to.equal(BYTES32_ONE_BEST_USER);
        expect(third).to.equal(BYTES32_ONE);
        expect(fourth).to.equal(BYTES32_TWO);
        expect(fifth).to.equal(BYTES32_THREE);
    });
    it("should allow to iterate over content and check order - part 2", async () => {
        await set.insert(BYTES32_ONE);
        await set.insert(BYTES32_ONE_BEST_AMOUNT);
        await set.insert(BYTES32_ONE_BEST_USER);
        await set.insert(BYTES32_TWO);
        await set.insert(BYTES32_THREE);

        const first = await set.first();
        const second = await set.next(first);
        const third = await set.next(second);
        const fourth = await set.next(third);
        const fifth = await set.next(fourth);

        expect(first).to.equal(BYTES32_ONE_BEST_AMOUNT);
        expect(second).to.equal(BYTES32_ONE_BEST_USER);
        expect(third).to.equal(BYTES32_ONE);
        expect(fourth).to.equal(BYTES32_TWO);
        expect(fifth).to.equal(BYTES32_THREE);
    });
    it("should allow to insert same limit price with different amount with same user", async () => {
        await set.insert(BYTES32_ONE);
        expect(await set.callStatic.insert(BYTES32_ONE_DIFFERENT)).to.equal(true);
        await set.insert(BYTES32_ONE_DIFFERENT);
        expect(await set.callStatic.insert(BYTES32_ONE_DIFFERENT)).to.equal(false);
    });
    it("should throw if the same orders are compared with smallerThan", async () => {
        await expect(set.smallerThan(BYTES32_ONE, BYTES32_ONE)).to.be.revertedWith(
            "user is not allowed to place same order twice",
        );
    });

    it("should allow to insert element at certain element", async () => {
        await set.insert(BYTES32_ONE);
        await set.insert(BYTES32_THREE);

        expect(await set.callStatic.insertAt(BYTES32_TWO, BYTES32_ONE)).to.equal(
            true,
        );
        expect(await set.callStatic.insertAt(BYTES32_TWO, BYTES32_THREE)).to.equal(
            false,
        );
    });

    it("should not allow to insert element with non-containing element-Before-New-One", async () => {
        await set.insert(BYTES32_THREE);

        expect(await set.callStatic.insertAt(BYTES32_TWO, BYTES32_ONE)).to.equal(
            false,
        );
    });

    it("should not allow to insert element with element not in front of other element", async () => {
        expect(await set.callStatic.insertAt(BYTES32_TWO, BYTES32_THREE)).to.equal(
            false,
        );
    });

    it("should not allow to insert queue start element", async () => {
        await expect(
            set.callStatic.insertAt(queueStartElement, queueStartElement),
        ).to.be.revertedWith("Inserting element is not valid");
    });
    it("should not allow to insert queue end element", async () => {
        await expect(
            set.callStatic.insertAt(queueLastElement, queueStartElement),
        ).to.be.revertedWith("Inserting element is not valid");
    });

    it.only("should insert element according to rate", async () => {
        await set.insert(BYTES32_THREE);
        await set.insert(BYTES32_ONE);
        await set.insert(BYTES32_TWO);

        const first = await set.first();
        const second = await set.next(first);
        const third = await set.next(second);

        expect(first).to.equal(BYTES32_ONE);
        expect(second).to.equal(BYTES32_TWO);
        expect(third).to.equal(BYTES32_THREE);
    });

    it("does not allow to get next of the queue end element", async () => {
        await set.insert(BYTES32_THREE);

        const first = await set.first();
        const second = await set.next(first);
        await expect(set.next(second)).to.be.revertedWith(
            "Trying to get next of last element",
        );
    });

    it("doesn't allow to insert a number with denominator == 0", async () => {
        await expect(set.insert(BYTES32_ZERO)).to.be.revertedWith(
            "Inserting zero is not supported",
        );
    });

    it("cannot get first of empty list", async () => {
        await expect(set.first()).to.be.revertedWith(
            "Trying to get first from empty set",
        );
    });

    it("cannot get next of non-existent element", async () => {
        await set.insert(BYTES32_ONE);
        await expect(set.next(BYTES32_TWO)).to.be.reverted;
    });

    it("should remove element", async () => {
        await set.insert(BYTES32_THREE);
        await set.insert(BYTES32_ONE);
        await set.insert(BYTES32_TWO);

        await set.remove(BYTES32_TWO);

        const first = await set.first();
        const second = await set.next(first);
        const prev_of_removed = await set.prevMap(BYTES32_TWO);
        const next_of_removed = await set.nextMap(BYTES32_TWO);

        expect(first).to.equal(BYTES32_ONE);
        expect(second).to.equal(BYTES32_THREE);
        expect(prev_of_removed).to.equal(ethers.constants.Zero);
        expect(next_of_removed).to.equal(ethers.constants.Zero);
    });
    it("should remove element keeping history", async () => {
        await set.insert(BYTES32_THREE);
        await set.insert(BYTES32_ONE);
        await set.insert(BYTES32_TWO);

        await set.removeKeepHistory(BYTES32_TWO);

        const first = await set.first();
        const second = await set.next(first);
        const prev_of_removed = await set.prevMap(BYTES32_TWO);
        const next_of_removed = await set.nextMap(BYTES32_TWO);

        expect(first).to.equal(BYTES32_ONE);
        expect(second).to.equal(BYTES32_THREE);
        expect(prev_of_removed).to.equal(BYTES32_ONE);
        expect(next_of_removed).to.equal(ethers.constants.Zero);
    });

    it("should allow to remove element twice", async () => {
        await set.insert(BYTES32_ONE);
        await set.insert(BYTES32_TWO);
        await set.insert(BYTES32_THREE);

        expect(await set.callStatic.remove(BYTES32_TWO)).to.equal(true);
        await set.remove(BYTES32_TWO);
        expect(await set.callStatic.remove(BYTES32_TWO)).to.equal(false);
    });

    describe("insert elements using removed element as reference", () => {
        it("single element removed", async () => {
            await set.insert(BYTES32_ONE);
            await set.insert(BYTES32_TWO);
            await set.insert(BYTES32_FOUR);

            await set.removeKeepHistory(BYTES32_TWO);
            expect(
                await set.callStatic.insertAt(BYTES32_THREE, BYTES32_TWO),
            ).to.equal(true);
            await set.insertAt(BYTES32_THREE, BYTES32_TWO);

            const first = await set.first();
            const second = await set.next(first);
            const third = await set.next(second);
            const next_of_third = await set.nextMap(third);

            expect(first).to.equal(BYTES32_ONE);
            expect(second).to.equal(BYTES32_THREE);
            expect(third).to.equal(BYTES32_FOUR);
            expect(next_of_third).to.equal(QUEUE_END);
        });

        it("two elements removed, backtrack once", async () => {
            await set.insert(BYTES32_ONE);
            await set.insert(BYTES32_TWO);
            await set.insert(BYTES32_THREE);
            await set.insert(BYTES32_FIVE);
            // 1 ─> 2 ─> 3 ─> 5

            await set.removeKeepHistory(BYTES32_TWO);
            // 1  ─> 3 ─> 5
            // └───> 2
            expect(await set.prevMap(BYTES32_TWO)).to.equal(BYTES32_ONE);
            expect(await set.nextMap(BYTES32_TWO)).to.equal(ethers.constants.Zero);
            await set.removeKeepHistory(BYTES32_THREE);
            // 1 ─> 5
            // └──> 2
            // └──> 3
            expect(await set.prevMap(BYTES32_THREE)).to.equal(BYTES32_ONE);
            expect(await set.nextMap(BYTES32_THREE)).to.equal(ethers.constants.Zero);
            await set.insertAt(BYTES32_FOUR, BYTES32_TWO);
            // 1 ─> 4 ─> 5
            // └──> 2
            // └──> 3

            const first = await set.first();
            const second = await set.next(first);
            const third = await set.next(second);
            const next_of_third = await set.nextMap(third);

            expect(first).to.equal(BYTES32_ONE);
            expect(second).to.equal(BYTES32_FOUR);
            expect(third).to.equal(BYTES32_FIVE);
            expect(next_of_third).to.equal(QUEUE_END);
        });

        it("two elements removed, backtrack twice", async () => {
            await set.insert(BYTES32_ONE);
            await set.insert(BYTES32_TWO);
            await set.insert(BYTES32_THREE);
            await set.insert(BYTES32_FIVE);
            // 1 ─> 2 ─> 3 ─> 5

            await set.removeKeepHistory(BYTES32_THREE);
            // 1 ─> 2 ─> 5
            //      └──> 3
            expect(await set.prevMap(BYTES32_THREE)).to.equal(BYTES32_TWO);
            expect(await set.nextMap(BYTES32_THREE)).to.equal(ethers.constants.Zero);
            await set.removeKeepHistory(BYTES32_TWO);
            // 1 ─> 5
            // └──> 2
            //      └──> 3
            expect(await set.prevMap(BYTES32_TWO)).to.equal(BYTES32_ONE);
            expect(await set.nextMap(BYTES32_TWO)).to.equal(ethers.constants.Zero);
            await set.insertAt(BYTES32_FOUR, BYTES32_THREE);
            // 1 ─> 4 ─> 5
            // └──> 2
            //      └──> 3

            const first = await set.first();
            const second = await set.next(first);
            const third = await set.next(second);
            const next_of_third = await set.nextMap(third);

            expect(first).to.equal(BYTES32_ONE);
            expect(second).to.equal(BYTES32_FOUR);
            expect(third).to.equal(BYTES32_FIVE);
            expect(next_of_third).to.equal(QUEUE_END);
        });

        it("one element removed, one added", async () => {
            await set.insert(BYTES32_ONE);
            await set.insert(BYTES32_TWO);
            await set.insert(BYTES32_FIVE);
            // 1 ─> 2 ─> 5

            await set.removeKeepHistory(BYTES32_TWO);
            // 1 ─> 5
            // └──> 2
            expect(await set.prevMap(BYTES32_TWO)).to.equal(BYTES32_ONE);
            expect(await set.nextMap(BYTES32_TWO)).to.equal(ethers.constants.Zero);

            await set.insert(BYTES32_THREE);
            // 1 ─> 3 ─> 5
            // └──> 2
            expect(await set.prevMap(BYTES32_THREE)).to.equal(BYTES32_ONE);
            expect(await set.nextMap(BYTES32_THREE)).to.equal(BYTES32_FIVE);

            await set.insertAt(BYTES32_FOUR, BYTES32_TWO);
            // 1 ─> 3 ─> 4 ─> 5
            // └──> 2
            expect(await set.prevMap(BYTES32_FOUR)).to.equal(BYTES32_THREE);
            expect(await set.nextMap(BYTES32_FOUR)).to.equal(BYTES32_FIVE);

            const first = await set.first();
            const second = await set.next(first);
            const third = await set.next(second);
            const fourth = await set.next(third);
            const next_of_third = await set.nextMap(fourth);

            expect(first).to.equal(BYTES32_ONE);
            expect(second).to.equal(BYTES32_THREE);
            expect(third).to.equal(BYTES32_FOUR);
            expect(fourth).to.equal(BYTES32_FIVE);
            expect(next_of_third).to.equal(QUEUE_END);
        });
    });

    it("should recognize empty sets", async () => {
        expect(await set.callStatic.isEmpty()).to.equal(true);
        await set.insert(BYTES32_ONE);
        expect(await set.callStatic.isEmpty()).to.equal(false);
        await set.remove(BYTES32_ONE);
        expect(await set.callStatic.isEmpty()).to.equal(true);
    });

    it("cannot contain queue start element or queue end element", async () => {
        expect(await set.callStatic.contains(queueLastElement)).to.equal(false);
        expect(await set.callStatic.contains(queueStartElement)).to.equal(false);
    });

    it("cannot contain queue start element or queue end element", async () => {
        expect(await set.callStatic.contains(queueLastElement)).to.equal(false);
        expect(await set.callStatic.contains(queueStartElement)).to.equal(false);
    });

    it("does not allow to remove element not contained", async () => {
        await set.insert(BYTES32_ONE);
        await set.insert(BYTES32_TWO);

        expect(await set.callStatic.remove(BYTES32_THREE)).to.equal(false);
        expect(await set.callStatic.removeKeepHistory(BYTES32_THREE)).to.equal(
            false,
        );
    });

    it("can add element BYTES32_ONE => rate of startingElement ==0", async () => {
        expect(await set.callStatic.insert(BYTES32_ONE)).to.equal(true);
    });

    it("encodeOrder reverses decodeOrder", async () => {
        const ans = await set.decodeOrder(BYTES32_THREE);
        expect(await set.callStatic.encodeOrder(ans[0], ans[1], ans[2])).to.equal(
            BYTES32_THREE,
        );
    });
});

function encodeOrder(order: Order): string {
    // 8*4=32bit, 16*4=64bit
    return (
        "0x" +
        order.payout.toHexString().slice(2).padStart(8, "0") +
        order.amount.toHexString().slice(2).padStart(16, "0") +
        order.user.toString().slice(2).padStart(40, "0")
    );
}