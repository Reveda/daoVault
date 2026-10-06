// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DAOvault activation receiver.
 *
 * This contract is intentionally small and immutable:
 * - users approve the USDT token contract first;
 * - activate() pulls exactly activationAmount from the caller;
 * - the payment is forwarded to the configured treasury;
 * - an on-chain Activated event is emitted for the backend indexer.
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
    uint256 public immutable activationAmount;

    mapping(address => bool) public activated;
    mapping(address => address) public sponsorOf;

    event Activated(
        address indexed user,
        address indexed sponsor,
        uint256 amount,
        uint256 timestamp
    );

    error InvalidAddress();
    error InvalidAmount();
    error AlreadyActivated();
    error InvalidSponsor();
    error PaymentFailed();

    constructor(address usdtAddress, address treasuryAddress, uint256 amount) {
        if (usdtAddress == address(0) || treasuryAddress == address(0)) {
            revert InvalidAddress();
        }
        if (amount == 0) revert InvalidAmount();

        usdt = IERC20Minimal(usdtAddress);
        treasury = treasuryAddress;
        activationAmount = amount;
    }

    /**
     * User must call USDT.approve(address(this), activationAmount) first.
     * Pass address(0) when there is no sponsor.
     */
    function activate(address sponsor) external {
        if (activated[msg.sender]) revert AlreadyActivated();
        if (sponsor == msg.sender) revert InvalidSponsor();

        bool transferred = usdt.transferFrom(msg.sender, treasury, activationAmount);
        if (!transferred) revert PaymentFailed();

        activated[msg.sender] = true;
        sponsorOf[msg.sender] = sponsor;

        emit Activated(msg.sender, sponsor, activationAmount, block.timestamp);
    }

    function isActivated(address user) external view returns (bool) {
        return activated[user];
    }
}
