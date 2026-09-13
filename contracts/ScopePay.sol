// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ScopePay
/// @notice USDC milestone escrow for clients and independent workers.
/// @dev Terms and evidence are stored off-chain; only their commitments are public.
contract ScopePay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum MilestoneStatus { Pending, Submitted, Released, Refunded }
    struct Deal {
        address client; address worker; address arbiter; bytes32 termsCommitment;
        uint128 totalDeposited; uint128 remaining; uint32 currentMilestone;
        uint32 milestoneCount; bool disputed; bool closed;
    }
    struct Milestone { uint128 amount; uint64 dueAt; MilestoneStatus status; bytes32 evidenceCommitment; }

    IERC20 public immutable paymentToken;
    uint256 public nextDealId;
    mapping(uint256 => Deal) public deals;
    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;

    error InvalidParty(); error InvalidMilestones(); error InvalidToken();
    error Unauthorized(); error InvalidState(); error WrongAmount();

    event DealCreated(uint256 indexed dealId, address indexed client, address indexed worker, address arbiter, uint256 value, bytes32 termsCommitment);
    event MilestoneSubmitted(uint256 indexed dealId, uint256 indexed milestone, bytes32 evidenceCommitment);
    event MilestoneReleased(uint256 indexed dealId, uint256 indexed milestone, uint256 amount);
    event DisputeOpened(uint256 indexed dealId, uint256 indexed milestone, address indexed openedBy, bytes32 reasonCommitment);
    event DisputeResolved(uint256 indexed dealId, uint256 indexed milestone, uint256 workerAmount, uint256 clientAmount);
    event DealCancelled(uint256 indexed dealId, uint256 refundedAmount);

    constructor(address token) {
        if (token == address(0) || token.code.length == 0) revert InvalidToken();
        paymentToken = IERC20(token);
    }

    function createDeal(address worker, address arbiter, uint128[] calldata amounts, uint64[] calldata dueDates, bytes32 termsCommitment) external nonReentrant returns (uint256 dealId) {
        if (worker == address(0) || arbiter == address(0) || worker == msg.sender || arbiter == msg.sender || arbiter == worker) revert InvalidParty();
        if (amounts.length == 0 || amounts.length > 12 || amounts.length != dueDates.length || termsCommitment == bytes32(0)) revert InvalidMilestones();
        uint256 total; uint64 previous;
        for (uint256 i; i < amounts.length; ++i) {
            if (amounts[i] == 0 || dueDates[i] <= block.timestamp || dueDates[i] <= previous) revert InvalidMilestones();
            total += amounts[i]; previous = dueDates[i];
        }
        if (total > type(uint128).max) revert WrongAmount();
        dealId = nextDealId++;
        deals[dealId] = Deal(msg.sender, worker, arbiter, termsCommitment, uint128(total), uint128(total), 0, uint32(amounts.length), false, false);
        for (uint256 i; i < amounts.length; ++i) milestones[dealId][i] = Milestone(amounts[i], dueDates[i], MilestoneStatus.Pending, bytes32(0));
        paymentToken.safeTransferFrom(msg.sender, address(this), total);
        emit DealCreated(dealId, msg.sender, worker, arbiter, total, termsCommitment);
    }

    function submitMilestone(uint256 dealId, uint256 milestone, bytes32 evidenceCommitment) external {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.worker) revert Unauthorized();
        if (deal.closed || deal.disputed || milestone != deal.currentMilestone || evidenceCommitment == bytes32(0)) revert InvalidState();
        Milestone storage item = milestones[dealId][milestone];
        if (item.status != MilestoneStatus.Pending) revert InvalidState();
        item.status = MilestoneStatus.Submitted; item.evidenceCommitment = evidenceCommitment;
        emit MilestoneSubmitted(dealId, milestone, evidenceCommitment);
    }

    function approveMilestone(uint256 dealId, uint256 milestone) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client) revert Unauthorized();
        if (deal.closed || deal.disputed || milestone != deal.currentMilestone) revert InvalidState();
        Milestone storage item = milestones[dealId][milestone];
        if (item.status != MilestoneStatus.Submitted) revert InvalidState();
        item.status = MilestoneStatus.Released; deal.remaining -= item.amount; deal.currentMilestone++;
        if (deal.currentMilestone == deal.milestoneCount) deal.closed = true;
        paymentToken.safeTransfer(deal.worker, item.amount);
        emit MilestoneReleased(dealId, milestone, item.amount);
    }

    function openDispute(uint256 dealId, bytes32 reasonCommitment) external {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client && msg.sender != deal.worker) revert Unauthorized();
        if (deal.closed || deal.disputed || reasonCommitment == bytes32(0)) revert InvalidState();
        deal.disputed = true;
        emit DisputeOpened(dealId, deal.currentMilestone, msg.sender, reasonCommitment);
    }

    /// @notice The named arbiter splits the current milestone; unearned future funds return to the client.
    function resolveDispute(uint256 dealId, uint128 workerAmount) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.arbiter) revert Unauthorized();
        if (deal.closed || !deal.disputed) revert InvalidState();
        Milestone storage item = milestones[dealId][deal.currentMilestone];
        if (workerAmount > item.amount) revert WrongAmount();
        uint256 clientAmount = deal.remaining - workerAmount;
        item.status = workerAmount == 0 ? MilestoneStatus.Refunded : MilestoneStatus.Released;
        deal.remaining = 0; deal.closed = true; deal.disputed = false;
        if (workerAmount != 0) paymentToken.safeTransfer(deal.worker, workerAmount);
        if (clientAmount != 0) paymentToken.safeTransfer(deal.client, clientAmount);
        emit DisputeResolved(dealId, deal.currentMilestone, workerAmount, clientAmount);
    }

    function cancelUnstarted(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client) revert Unauthorized();
        if (deal.closed || deal.disputed || deal.currentMilestone != 0 || milestones[dealId][0].status != MilestoneStatus.Pending) revert InvalidState();
        uint256 refund = deal.remaining; deal.remaining = 0; deal.closed = true;
        milestones[dealId][0].status = MilestoneStatus.Refunded;
        paymentToken.safeTransfer(deal.client, refund);
        emit DealCancelled(dealId, refund);
    }
}
