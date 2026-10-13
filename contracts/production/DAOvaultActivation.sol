// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DAOvault activation receiver.
 *
 * This contract is intentionally small and immutable:
 * - users approve the USDT token contract first;
 * - activate() pulls exactly activationAmount from the caller;
 * - the payment is split in the same transaction (owner, 2026-10-13): 45% (PAYOUT_SHARE_BPS)
 *   to the payout contract (DAOvaultPayout.sol: the float members' withdrawals are paid from)
 *   and the rest (55%) to the treasury. Both addresses are fixed at deploy (immutable);
 * - an on-chain Activated event is emitted for the backend indexer;
 * - the treasury (company) wallet is the ROOT of the referral tree: it never pays, it is
 *   treated as activated, and anyone can join under it. No other wallet can be activated
 *   without paying, and the treasury is fixed at deploy (immutable);
 * - the sponsor does not have to be activated (owner, 2026-10-13); it only cannot be the payer;
 * - topUp(): an activated member pays another $300 for a new package (re-entry after the
 *   earnings cap, owner 2026-10-10). Same wallet, same sponsor; the cap itself is tracked off-chain.
 *
 * This contract does not yet implement the 20-level commission or withdrawal
 * engine. Those rules need a separately reviewed/audited contract before any
 * mainnet funds are accepted.
 */

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract DAOvaultActivation {
    IERC20Minimal public immutable usdt;
    address public immutable treasury;
    /// DAOvaultPayout contract: receives PAYOUT_SHARE_BPS of every payment (withdrawal float)
    address public immutable payoutVault;
    uint256 public immutable activationAmount;
    /// 45.00% of every $300 (= $135) goes to the payout contract, the rest (= $165) to the treasury
    uint256 public constant PAYOUT_SHARE_BPS = 4500;

    mapping(address => bool) public activated;
    mapping(address => address) public sponsorOf;
    /// extra packages bought with topUp() (the first package is the activation)
    mapping(address => uint256) public topUps;

    event Activated(
        address indexed user,
        address indexed sponsor,
        uint256 amount,
        uint256 timestamp
    );

    event ToppedUp(
        address indexed user,
        uint256 amount,
        uint256 count,
        uint256 timestamp
    );

    error InvalidAddress();
    error InvalidAmount();
    error AlreadyActivated();
    error InvalidSponsor();
    error PaymentFailed();
    error TreasuryIsRoot();
    error NotActivated();

    constructor(address usdtAddress, address treasuryAddress, address payoutVaultAddress, uint256 amount) {
        if (usdtAddress == address(0) || treasuryAddress == address(0) || payoutVaultAddress == address(0)) {
            revert InvalidAddress();
        }
        if (payoutVaultAddress == treasuryAddress) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        usdt = IERC20Minimal(usdtAddress);
        treasury = treasuryAddress;
        payoutVault = payoutVaultAddress;
        activationAmount = amount;
    }

    /// 45% to the payout contract, the rest to the treasury (the two always add up to activationAmount)
    function _collect(address from) private {
        uint256 toPayout = (activationAmount * PAYOUT_SHARE_BPS) / 10_000;
        if (!usdt.transferFrom(from, payoutVault, toPayout)) revert PaymentFailed();
        if (!usdt.transferFrom(from, treasury, activationAmount - toPayout)) revert PaymentFailed();
    }

    /**
     * User must call USDT.approve(address(this), activationAmount) first.
     * Pass address(0) when there is no sponsor.
     */
    function activate(address sponsor) external {
        // the treasury is the root: it is never a paying member under someone else
        if (msg.sender == treasury) revert TreasuryIsRoot();
        if (activated[msg.sender]) revert AlreadyActivated();
        if (sponsor == msg.sender) revert InvalidSponsor();
        // any wallet can be the sponsor, paid or not (owner, 2026-10-13: teams are built from
        // invite links during the pre-launch marketing days; the backend decides the tree and
        // an unpaid sponsor earns nothing until it activates). Zero address = no sponsor.

        _collect(msg.sender);

        activated[msg.sender] = true;
        sponsorOf[msg.sender] = sponsor;

        emit Activated(msg.sender, sponsor, activationAmount, block.timestamp);
    }

    /**
     * Re-entry: an activated member buys another package for activationAmount (approve first).
     * The treasury root is not a paid member, so it cannot top up.
     */
    function topUp() external {
        if (!activated[msg.sender]) revert NotActivated();

        _collect(msg.sender);

        uint256 count = ++topUps[msg.sender];
        emit ToppedUp(msg.sender, activationAmount, count, block.timestamp);
    }

    /// the treasury (root) counts as activated without a payment
    function isActivated(address user) external view returns (bool) {
        return user == treasury || activated[user];
    }
}
