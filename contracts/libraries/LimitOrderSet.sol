// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "hardhat/console.sol";

library LimitOrderSet {
  using SafeMath for uint256;

  // represents smallest possible value for an order under comparison of fn smallerThan()
  uint256 public constant QUEUE_START = 0;

  // represents highest possible value for an order under comparison of fn smallerThan()
  uint256 public constant QUEUE_END =
    115792089237316195423570985008687907853269984665640564039457584007913129639935;

  /// The struct is used to implement a modified version of a doubly linked
  /// list with sorted elements. The list starts from QUEUE_START to
  /// QUEUE_END, and each node keeps track of its predecessor and successor.
  /// Nodes can be added or removed.
  ///
  /// `next` and `prev` have a different role. The list is supposed to be
  /// traversed with `next`. If `next` is empty, the node is not part of the
  /// list. However, `prev` might be set for elements that are not in the
  /// list, which is why it should not be used for traversing. Having a `prev`
  /// set for elements not in the list is used to keep track of the history of
  /// the position in the list of a removed element.
  struct Data {
    mapping(uint256 => uint256) nextMap;
    mapping(uint256 => uint256) prevMap;
    mapping(uint256 => LimitOrder) orderMap;
  }

  struct LimitOrder {
    uint256 idx;
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

  function initializeEmptyList(Data storage self) internal {
    self.nextMap[QUEUE_START] = QUEUE_END;
    self.prevMap[QUEUE_END] = QUEUE_START;
  }

  function isEmpty(Data storage self) internal view returns (bool) {
    return self.nextMap[QUEUE_START] == QUEUE_END;
  }

  function insert(
    Data storage self,
    LimitOrder memory elementToInsert,
    uint256 idxBeforeNewOne
  ) internal returns (bool) {
    //(uint32 payout, uint64 amount, address user) = decodeOrder(elementToInsert);

    // console.log("user: %s, payout: %s, amount: %s", user, payout, amount);

    require(
      elementToInsert.payout != 0,
      "Inserting zero payout is not supported"
    );
    require(
      elementToInsert.amount != 0,
      "Inserting zero amount is not supported"
    );

    require(
      elementToInsert.idx > QUEUE_START && elementToInsert.idx < QUEUE_END,
      "Inserting element has not valid index"
    );
    if (contains(self, elementToInsert.idx)) {
      return false;
    }
    if (idxBeforeNewOne != QUEUE_START && self.prevMap[idxBeforeNewOne] == 0) {
      return false;
    }
    if (!smallerThan(self, idxBeforeNewOne, elementToInsert)) {
      return false;
    }

    // `elementBeforeNewOne` might have been removed during the time it
    // took to the transaction calling this function to be mined, so
    // the new order cannot be appended directly to this. We follow the
    // history of previous links backwards until we find an element in
    // the list from which to start our search.
    // Note that following the link backwards returns elements that are
    // before `elementBeforeNewOne` in sorted order.
    while (self.nextMap[idxBeforeNewOne] == 0) {
      idxBeforeNewOne = self.prevMap[idxBeforeNewOne];
    }

    // `elementBeforeNewOne` belongs now to the linked list. We search the
    // largest entry that is smaller than the element to insert.
    uint256 previous;
    uint256 current = idxBeforeNewOne;
    do {
      previous = current;
      current = self.nextMap[current];
    } while (smallerThan(self, current, elementToInsert));
    // Note: previous < elementToInsert < current
    self.nextMap[previous] = elementToInsert.idx;
    self.prevMap[current] = elementToInsert.idx;
    self.prevMap[elementToInsert.idx] = previous;
    self.nextMap[elementToInsert.idx] = current;
    self.orderMap[elementToInsert.idx] = elementToInsert;

    return true;
  }

  /// The element is removed from the linked list, but the node retains
  /// information on which predecessor it had, so that a node in the chain
  /// can be reached by following the predecessor chain of deleted elements.
  function removeKeepHistory(
    Data storage self,
    uint256 idxToRemove
  ) internal returns (bool) {
    if (!contains(self, idxToRemove)) {
      return false;
    }
    uint256 previousIdx = self.prevMap[idxToRemove];
    uint256 nextIdx = self.nextMap[idxToRemove];
    self.nextMap[previousIdx] = nextIdx;
    self.prevMap[nextIdx] = previousIdx;
    self.nextMap[idxToRemove] = 0;
    return true;
  }

  /// Remove an element from the chain, clearing all related storage.
  /// Note that no elements should be inserted using as a reference point a
  /// node deleted after calling `remove`, since an element in the `prev`
  /// chain might be missing.
  function remove(Data storage self, uint idxToRemove) internal returns (bool) {
    bool result = removeKeepHistory(self, idxToRemove);
    if (result) {
      self.prevMap[idxToRemove] = 0;
      delete self.orderMap[idxToRemove];
    }
    return result;
  }

  function contains(
    Data storage self,
    uint256 idx
  ) internal view returns (bool) {
    if (idx == QUEUE_START) {
      return false;
    }
    // Note: QUEUE_END is not contained in the list since it has no
    // successor.
    return self.nextMap[idx] != 0;
  }

  // @dev orders are ordered by
  // 1. their payout
  function smallerThan(
    Data storage self,
    uint256 orderLeftIdx,
    LimitOrder memory orderRight
  ) internal view returns (bool) {
    LimitOrder storage orderLeft = self.orderMap[orderLeftIdx];

    if (orderLeft.payout < orderRight.payout) return true;
    // if (payoutLeft > payoutRight) return false;

    return false;
  }

  function getUndeclaredAmt(
    Data storage self,
    address user
  ) internal view returns (uint256) {
    uint256 idx = self.nextMap[QUEUE_START];
    uint256 amt = 0;
    while (idx != QUEUE_START && idx != QUEUE_END) {
      LimitOrder storage order = self.orderMap[idx];
      if (order.user == user && order.status == LimitOrderStatus.Undeclared) {
        amt += order.amount;
      }
    }
    return amt;
  }

  function first(Data storage self) internal view returns (uint256) {
    require(!isEmpty(self), "Trying to get first from empty set");
    return self.nextMap[QUEUE_START];
  }

  function next(
    Data storage self,
    uint256 idx
  ) internal view returns (uint256) {
    require(idx != QUEUE_END, "Trying to get next of last element");
    uint256 nextIdx = self.nextMap[idx];
    require(nextIdx != 0, "Trying to get next of non-existent element");
    return nextIdx;
  }
}
