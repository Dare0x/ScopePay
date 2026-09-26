// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ScopePay v2
/// @notice Milestone escrow in USDC or USDG for clients and independent workers.
/// @dev Terms, evidence and dispute reasons stay off-chain; only their hashes are stored.
///      No party can hold the money hostage: a client who never reviews, a worker who
///      never delivers, and an arbiter who never decides each give the other side a
///      way to settle once a clock known at signing time has run out.
contract ScopePay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum MilestoneStatus { Pending, Submitted, Released, Refunded }

    struct Deal {
        address client;
        address worker;
        address arbiter;
        address token;
        bytes32 termsCommitment;
        uint128 totalDeposited;
        uint128 remaining;
        uint32 currentMilestone;
        uint32 milestoneCount;
        uint32 reviewWindow; // seconds the client has to review a submission
        uint64 activeSince;  // when the current milestone became the current one
        uint64 disputedAt;   // zero unless a dispute is open
        bool closed;
    }

    struct Milestone {
        uint128 amount;
        uint64 dueAt;
        uint64 submittedAt;
        MilestoneStatus status;
        bytes32 evidenceCommitment;
    }

    uint32 public constant MIN_REVIEW_WINDOW = 1 hours;
    uint32 public constant MAX_REVIEW_WINDOW = 30 days;
    uint64 public constant ARBITER_WINDOW = 14 days;
    uint256 public constant MAX_MILESTONES = 12;
    uint256 public constant MAX_TOKENS = 4;

    mapping(address => bool) public isSupportedToken;
    address[] private tokenList;
    uint256 public nextDealId;
    mapping(uint256 => Deal) private deals;
    mapping(uint256 => mapping(uint256 => Milestone)) private milestones;

    error InvalidToken(); error UnsupportedToken(); error InvalidParty(); error InvalidMilestones();
    error InvalidWindow(); error Unauthorized(); error InvalidState(); error WrongAmount(); error TooEarly();

    event DealCreated(uint256 indexed dealId, address indexed client, address indexed worker, address arbiter, address token, uint256 value, uint32 reviewWindow, bytes32 termsCommitment);
    event MilestoneSubmitted(uint256 indexed dealId, uint256 indexed milestone, bytes32 evidenceCommitment);
    event MilestoneReleased(uint256 indexed dealId, uint256 indexed milestone, uint256 amount, bool afterReviewWindow);
    event DisputeOpened(uint256 indexed dealId, uint256 indexed milestone, address indexed openedBy, bytes32 reasonCommitment);
    event DisputeResolved(uint256 indexed dealId, uint256 indexed milestone, uint256 workerAmount, uint256 clientAmount, bool arbiterTimedOut);
    event DealCancelled(uint256 indexed dealId, uint256 indexed milestone, uint256 refundedAmount, bool deadlineMissed);

    constructor(address[] memory tokens) {
        if (tokens.length == 0 || tokens.length > MAX_TOKENS) revert InvalidToken();
        for (uint256 i; i < tokens.length; ++i) {
            address token = tokens[i];
            if (token == address(0) || token.code.length == 0 || isSupportedToken[token]) revert InvalidToken();
            isSupportedToken[token] = true;
            tokenList.push(token);
        }
    }

    // ----- creating a deal -----

    function createDeal(
        address token,
        address worker,
        address arbiter,
        uint128[] calldata amounts,
        uint64[] calldata dueDates,
        uint32 reviewWindow,
        bytes32 termsCommitment
    ) external nonReentrant returns (uint256 dealId) {
        if (!isSupportedToken[token]) revert UnsupportedToken();
        if (worker == address(0) || arbiter == address(0) || worker == msg.sender || arbiter == msg.sender || arbiter == worker) revert InvalidParty();
        if (reviewWindow < MIN_REVIEW_WINDOW || reviewWindow > MAX_REVIEW_WINDOW) revert InvalidWindow();
        if (amounts.length == 0 || amounts.length > MAX_MILESTONES || amounts.length != dueDates.length || termsCommitment == bytes32(0)) revert InvalidMilestones();
        uint256 total; uint64 previous;
        for (uint256 i; i < amounts.length; ++i) {
            if (amounts[i] == 0 || dueDates[i] <= block.timestamp || dueDates[i] <= previous) revert InvalidMilestones();
            total += amounts[i]; previous = dueDates[i];
        }
        if (total > type(uint128).max) revert WrongAmount();

        dealId = nextDealId++;
        Deal storage deal = deals[dealId];
        deal.client = msg.sender; deal.worker = worker; deal.arbiter = arbiter; deal.token = token;
        deal.termsCommitment = termsCommitment;
        deal.totalDeposited = uint128(total); deal.remaining = uint128(total);
        deal.milestoneCount = uint32(amounts.length); deal.reviewWindow = reviewWindow;
        deal.activeSince = uint64(block.timestamp);
        for (uint256 i; i < amounts.length; ++i) milestones[dealId][i] = Milestone(amounts[i], dueDates[i], 0, MilestoneStatus.Pending, bytes32(0));

        // Measure what actually arrived, so a fee-on-transfer token cannot leave the deal underfunded.
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        if (IERC20(token).balanceOf(address(this)) - balanceBefore != total) revert WrongAmount();
        emit DealCreated(dealId, msg.sender, worker, arbiter, token, total, reviewWindow, termsCommitment);
    }

    // ----- the normal path -----

    function submitMilestone(uint256 dealId, uint256 milestone, bytes32 evidenceCommitment) external {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.worker) revert Unauthorized();
        if (deal.closed || deal.disputedAt != 0 || milestone != deal.currentMilestone || evidenceCommitment == bytes32(0)) revert InvalidState();
        Milestone storage item = milestones[dealId][milestone];
        if (item.status != MilestoneStatus.Pending) revert InvalidState();
        item.status = MilestoneStatus.Submitted;
        item.submittedAt = uint64(block.timestamp);
        item.evidenceCommitment = evidenceCommitment;
        emit MilestoneSubmitted(dealId, milestone, evidenceCommitment);
    }

    function approveMilestone(uint256 dealId, uint256 milestone) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client) revert Unauthorized();
        if (deal.closed || deal.disputedAt != 0 || milestone != deal.currentMilestone) revert InvalidState();
        if (milestones[dealId][milestone].status != MilestoneStatus.Submitted) revert InvalidState();
        _release(dealId, deal, false);
    }

    /// @notice A client who neither approves nor disputes within the review window has accepted the work.
    function claimAfterReviewWindow(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.worker) revert Unauthorized();
        if (deal.closed || deal.disputedAt != 0) revert InvalidState();
        Milestone storage item = milestones[dealId][deal.currentMilestone];
        if (item.status != MilestoneStatus.Submitted) revert InvalidState();
        if (block.timestamp < uint256(item.submittedAt) + deal.reviewWindow) revert TooEarly();
        _release(dealId, deal, true);
    }

    // ----- disputes -----

    function openDispute(uint256 dealId, bytes32 reasonCommitment) external {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client && msg.sender != deal.worker) revert Unauthorized();
        if (deal.closed || deal.disputedAt != 0 || reasonCommitment == bytes32(0)) revert InvalidState();
        deal.disputedAt = uint64(block.timestamp);
        emit DisputeOpened(dealId, deal.currentMilestone, msg.sender, reasonCommitment);
    }

    /// @notice The named arbiter splits the current milestone; unearned future funds return to the client.
    function resolveDispute(uint256 dealId, uint128 workerAmount) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.arbiter) revert Unauthorized();
        if (deal.closed || deal.disputedAt == 0) revert InvalidState();
        if (workerAmount > milestones[dealId][deal.currentMilestone].amount) revert WrongAmount();
        _settle(dealId, deal, workerAmount, false);
    }

    /// @notice If the arbiter stays silent, delivered work is split evenly and undelivered work is refunded.
    function settleAfterArbiterWindow(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client && msg.sender != deal.worker) revert Unauthorized();
        if (deal.closed || deal.disputedAt == 0) revert InvalidState();
        if (block.timestamp < uint256(deal.disputedAt) + ARBITER_WINDOW) revert TooEarly();
        Milestone storage item = milestones[dealId][deal.currentMilestone];
        _settle(dealId, deal, item.status == MilestoneStatus.Submitted ? item.amount / 2 : 0, true);
    }

    // ----- ending early -----

    function cancelUnstarted(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client) revert Unauthorized();
        if (deal.closed || deal.disputedAt != 0 || deal.currentMilestone != 0 || milestones[dealId][0].status != MilestoneStatus.Pending) revert InvalidState();
        _refund(dealId, deal, false);
    }

    /// @notice A worker who has not delivered the current milestone by its due date loses the rest of the deal.
    /// @dev The worker always gets at least one review window after the previous release, so a client
    ///      cannot run out the next deadline by approving late.
    function reclaimAfterMissedDeadline(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client) revert Unauthorized();
        if (deal.closed || deal.disputedAt != 0) revert InvalidState();
        if (milestones[dealId][deal.currentMilestone].status != MilestoneStatus.Pending) revert InvalidState();
        if (block.timestamp <= missedDeadlineAt(dealId)) revert TooEarly();
        _refund(dealId, deal, true);
    }

    // ----- views -----

    function getDeal(uint256 dealId) external view returns (Deal memory) { return deals[dealId]; }

    function getMilestones(uint256 dealId) external view returns (Milestone[] memory items) {
        uint256 count = deals[dealId].milestoneCount;
        items = new Milestone[](count);
        for (uint256 i; i < count; ++i) items[i] = milestones[dealId][i];
    }

    function supportedTokens() external view returns (address[] memory) { return tokenList; }

    /// @notice The moment after which the client may reclaim an undelivered current milestone.
    function missedDeadlineAt(uint256 dealId) public view returns (uint256) {
        Deal storage deal = deals[dealId];
        uint256 due = milestones[dealId][deal.currentMilestone].dueAt;
        uint256 grace = uint256(deal.activeSince) + deal.reviewWindow;
        return due > grace ? due : grace;
    }

    // ----- internal settlement -----

    function _release(uint256 dealId, Deal storage deal, bool afterReviewWindow) private {
        uint256 index = deal.currentMilestone;
        Milestone storage item = milestones[dealId][index];
        uint128 amount = item.amount;
        item.status = MilestoneStatus.Released;
        deal.remaining -= amount;
        deal.currentMilestone = uint32(index + 1);
        deal.activeSince = uint64(block.timestamp);
        if (index + 1 == deal.milestoneCount) deal.closed = true;
        IERC20(deal.token).safeTransfer(deal.worker, amount);
        emit MilestoneReleased(dealId, index, amount, afterReviewWindow);
    }

    function _settle(uint256 dealId, Deal storage deal, uint128 workerAmount, bool arbiterTimedOut) private {
        uint256 index = deal.currentMilestone;
        uint256 clientAmount = deal.remaining - workerAmount;
        milestones[dealId][index].status = workerAmount == 0 ? MilestoneStatus.Refunded : MilestoneStatus.Released;
        deal.remaining = 0; deal.closed = true; deal.disputedAt = 0;
        if (workerAmount != 0) IERC20(deal.token).safeTransfer(deal.worker, workerAmount);
        if (clientAmount != 0) IERC20(deal.token).safeTransfer(deal.client, clientAmount);
        emit DisputeResolved(dealId, index, workerAmount, clientAmount, arbiterTimedOut);
    }

    function _refund(uint256 dealId, Deal storage deal, bool deadlineMissed) private {
        uint256 index = deal.currentMilestone;
        uint256 refund = deal.remaining;
        milestones[dealId][index].status = MilestoneStatus.Refunded;
        deal.remaining = 0; deal.closed = true;
        IERC20(deal.token).safeTransfer(deal.client, refund);
        emit DealCancelled(dealId, index, refund, deadlineMissed);
    }
}
