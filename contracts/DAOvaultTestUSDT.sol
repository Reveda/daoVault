// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DAOVAULT Test USDT (tUSDT): a WORTHLESS token for BSC Testnet (chain 97) only.
 *
 * Lets the team test the full flow (wallet connect, $300 activation, commissions,
 * withdrawals) without real funds. Anyone can mint up to 10,000 per call through
 * mint() (the dashboard's "Get 1,000 test USDT" button), so it can never hold value.
 *
 * - The constructor refuses BSC Mainnet (56) and Ethereum (1): it cannot be deployed there.
 * - 18 decimals, like USDT on BNB Smart Chain, so amounts match the real token.
 * - Deploy it, then deploy DAOvaultActivation with this token's address as `usdt`.
 */
contract DAOvaultTestUSDT {
    string public constant name = "DAOVAULT Test USDT";
    string public constant symbol = "tUSDT";
    uint8 public constant decimals = 18;
    uint256 public constant MAX_MINT = 10_000 ether;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        require(block.chainid != 56 && block.chainid != 1, "test token: testnet only");
    }

    /// Free test tokens (faucet). Capped per call; there is no real value behind them.
    function mint(address to, uint256 amount) external {
        require(amount <= MAX_MINT, "max 10,000 tUSDT per mint");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "tUSDT: allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        require(to != address(0), "tUSDT: zero address");
        require(balanceOf[from] >= amount, "tUSDT: balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
