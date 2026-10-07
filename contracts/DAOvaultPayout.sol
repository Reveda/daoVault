// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DAOvault instant withdrawals.
 *
 * The treasury keeps a USDT float in this contract. When a member withdraws, the
 * backend checks their balance and signs a one-time voucher (EIP-712):
 *     "pay <member> <amount> USDT, withdrawal <id>, valid until <deadline>"
 * The member's own wallet submits it with claim(); the contract checks the
 * signature and sends the USDT to that wallet in the same transaction.
 *
 * Safety:
 * - only the wallet named in the voucher can claim it (msg.sender is signed);
 * - each withdrawal id pays once; vouchers expire;
 * - per-claim and per-day limits cap what a leaked signer key could ever take;
 * - the owner (treasury cold wallet / multisig) can pause, change the signer and
 *   limits, and pull the float back at any time;
 * - the signer key holds no funds: it can only authorise claims within the limits,
 *   and never more than the float in this contract.
 */

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract DAOvaultPayout {
    IERC20 public immutable usdt;

    address public owner;
    address public pendingOwner;
    address public signer;
    bool public paused;

    uint256 public maxPerClaim;
    uint256 public dailyLimit;
    uint256 public currentDay;
    uint256 public spentToday;

    mapping(bytes32 => bool) public used;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address member,uint256 amount,bytes32 id,uint256 deadline)");
    bytes32 private constant NAME_HASH = keccak256("DAOvaultPayout");
    bytes32 private constant VERSION_HASH = keccak256("1");
    /// half the secp256k1 order: higher s values are rejected (signature malleability)
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    event Claimed(bytes32 indexed id, address indexed member, uint256 amount);
    event SignerChanged(address indexed signer);
    event LimitsChanged(uint256 maxPerClaim, uint256 dailyLimit);
    event Paused(bool paused);
    event FloatWithdrawn(address indexed to, uint256 amount);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error IsPaused();
    error Expired();
    error AlreadyClaimed();
    error OverClaimLimit();
    error OverDailyLimit();
    error BadSignature();
    error InvalidAddress();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address usdtAddress, address owner_, address signer_, uint256 maxPerClaim_, uint256 dailyLimit_) {
        if (usdtAddress == address(0) || owner_ == address(0) || signer_ == address(0)) revert InvalidAddress();
        usdt = IERC20(usdtAddress);
        owner = owner_;
        signer = signer_;
        maxPerClaim = maxPerClaim_;
        dailyLimit = dailyLimit_;
        emit OwnershipTransferred(address(0), owner_);
        emit SignerChanged(signer_);
        emit LimitsChanged(maxPerClaim_, dailyLimit_);
    }

    // ── member ───────────────────────────────────────────────────────────

    /// Pays `amount` USDT to the caller if the backend signed this exact voucher for them.
    function claim(bytes32 id, uint256 amount, uint256 deadline, bytes calldata signature) external {
        if (paused) revert IsPaused();
        if (block.timestamp > deadline) revert Expired();
        if (used[id]) revert AlreadyClaimed();
        if (amount > maxPerClaim) revert OverClaimLimit();

        uint256 day = block.timestamp / 1 days;
        if (day != currentDay) {
            currentDay = day;
            spentToday = 0;
        }
        if (spentToday + amount > dailyLimit) revert OverDailyLimit();

        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, msg.sender, amount, id, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        if (_recover(digest, signature) != signer) revert BadSignature();

        used[id] = true;
        spentToday += amount;
        _send(msg.sender, amount);
        emit Claimed(id, msg.sender, amount);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function floatBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    // ── owner (treasury) ─────────────────────────────────────────────────

    function setSigner(address signer_) external onlyOwner {
        if (signer_ == address(0)) revert InvalidAddress();
        signer = signer_;
        emit SignerChanged(signer_);
    }

    function setLimits(uint256 maxPerClaim_, uint256 dailyLimit_) external onlyOwner {
        maxPerClaim = maxPerClaim_;
        dailyLimit = dailyLimit_;
        emit LimitsChanged(maxPerClaim_, dailyLimit_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    /// Pulls float back out (e.g. to the treasury). Works while paused.
    function withdrawFloat(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        _send(to, amount);
        emit FloatWithdrawn(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ── internals ────────────────────────────────────────────────────────

    /// Works with tokens that return bool and with ones that return nothing.
    function _send(address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(usdt).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if ((v != 27 && v != 28) || uint256(s) > HALF_N) revert BadSignature();
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert BadSignature();
        return recovered;
    }
}
