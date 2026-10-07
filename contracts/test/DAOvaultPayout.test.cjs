const { expect } = require('chai');
const { ethers } = require('hardhat');

const usd = (n) => ethers.parseUnits(String(n), 18);
const id = (s) => ethers.id(s);

describe('DAOvaultPayout', () => {
  let usdt, payout, owner, signer, alice, bob, chainId;
  const sign = async (who, member, amount, wid, deadline, contract = payout) =>
    who.signTypedData(
      { name: 'DAOvaultPayout', version: '1', chainId, verifyingContract: await contract.getAddress() },
      { Claim: [{ name: 'member', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'id', type: 'bytes32' }, { name: 'deadline', type: 'uint256' }] },
      { member, amount, id: wid, deadline },
    );
  const soon = async () => (await ethers.provider.getBlock('latest')).timestamp + 600;

  beforeEach(async () => {
    [owner, signer, alice, bob] = await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;
    usdt = await (await ethers.getContractFactory('MockUSDT')).deploy();
    payout = await (await ethers.getContractFactory('DAOvaultPayout')).deploy(await usdt.getAddress(), owner.address, signer.address, usd(500), usd(2000));
    await usdt.mint(await payout.getAddress(), usd(5000)); // treasury float
  });

  it('pays the member instantly with a valid voucher', async () => {
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(95), id('w1'), d);
    await expect(payout.connect(alice).claim(id('w1'), usd(95), d, sig)).to.emit(payout, 'Claimed').withArgs(id('w1'), alice.address, usd(95));
    expect(await usdt.balanceOf(alice.address)).to.equal(usd(95));
    expect(await payout.used(id('w1'))).to.equal(true);
  });

  it('refuses the same voucher twice', async () => {
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(95), id('w1'), d);
    await payout.connect(alice).claim(id('w1'), usd(95), d, sig);
    await expect(payout.connect(alice).claim(id('w1'), usd(95), d, sig)).to.be.revertedWithCustomError(payout, 'AlreadyClaimed');
  });

  it('refuses someone else using a voucher', async () => {
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(95), id('w1'), d);
    await expect(payout.connect(bob).claim(id('w1'), usd(95), d, sig)).to.be.revertedWithCustomError(payout, 'BadSignature');
  });

  it('refuses a changed amount', async () => {
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(95), id('w1'), d);
    await expect(payout.connect(alice).claim(id('w1'), usd(400), d, sig)).to.be.revertedWithCustomError(payout, 'BadSignature');
  });

  it('refuses a voucher signed by the wrong key', async () => {
    const d = await soon();
    const sig = await sign(bob, alice.address, usd(95), id('w1'), d);
    await expect(payout.connect(alice).claim(id('w1'), usd(95), d, sig)).to.be.revertedWithCustomError(payout, 'BadSignature');
  });

  it('refuses a voucher made for another contract', async () => {
    const other = await (await ethers.getContractFactory('DAOvaultPayout')).deploy(await usdt.getAddress(), owner.address, signer.address, usd(500), usd(2000));
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(95), id('w1'), d, other);
    await expect(payout.connect(alice).claim(id('w1'), usd(95), d, sig)).to.be.revertedWithCustomError(payout, 'BadSignature');
  });

  it('refuses an expired voucher', async () => {
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(95), id('w1'), d);
    await ethers.provider.send('evm_increaseTime', [601]);
    await ethers.provider.send('evm_mine', []);
    await expect(payout.connect(alice).claim(id('w1'), usd(95), d, sig)).to.be.revertedWithCustomError(payout, 'Expired');
  });

  it('enforces the per-claim limit', async () => {
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(501), id('w1'), d);
    await expect(payout.connect(alice).claim(id('w1'), usd(501), d, sig)).to.be.revertedWithCustomError(payout, 'OverClaimLimit');
  });

  it('enforces the daily limit and resets the next day', async () => {
    const d = await soon();
    for (let i = 0; i < 4; i++) {
      const sig = await sign(signer, alice.address, usd(500), id('d' + i), d);
      await payout.connect(alice).claim(id('d' + i), usd(500), d, sig);
    }
    const sig5 = await sign(signer, alice.address, usd(1), id('d4'), d);
    await expect(payout.connect(alice).claim(id('d4'), usd(1), d, sig5)).to.be.revertedWithCustomError(payout, 'OverDailyLimit');
    await ethers.provider.send('evm_increaseTime', [86400]);
    await ethers.provider.send('evm_mine', []);
    const d2 = await soon();
    const sig6 = await sign(signer, alice.address, usd(1), id('d5'), d2);
    await payout.connect(alice).claim(id('d5'), usd(1), d2, sig6);
    expect(await usdt.balanceOf(alice.address)).to.equal(usd(2001));
  });

  it('pause stops claims; only the owner can pause, change signer, pull float', async () => {
    await expect(payout.connect(alice).setPaused(true)).to.be.revertedWithCustomError(payout, 'NotOwner');
    await payout.setPaused(true);
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(95), id('w1'), d);
    await expect(payout.connect(alice).claim(id('w1'), usd(95), d, sig)).to.be.revertedWithCustomError(payout, 'IsPaused');
    await expect(payout.connect(signer).withdrawFloat(signer.address, usd(1))).to.be.revertedWithCustomError(payout, 'NotOwner');
    await payout.withdrawFloat(owner.address, usd(5000));
    expect(await usdt.balanceOf(owner.address)).to.equal(usd(5000));
    await payout.setSigner(bob.address);
    await payout.setPaused(false);
    await expect(payout.connect(alice).claim(id('w1'), usd(95), d, sig)).to.be.revertedWithCustomError(payout, 'BadSignature');
  });

  it('fails cleanly when the float is empty', async () => {
    await payout.withdrawFloat(owner.address, usd(5000));
    const d = await soon();
    const sig = await sign(signer, alice.address, usd(95), id('w1'), d);
    await expect(payout.connect(alice).claim(id('w1'), usd(95), d, sig)).to.be.revertedWithCustomError(payout, 'TransferFailed');
    expect(await payout.used(id('w1'))).to.equal(false);
  });

  it('two-step ownership transfer', async () => {
    await payout.transferOwnership(bob.address);
    expect(await payout.owner()).to.equal(owner.address);
    await expect(payout.connect(alice).acceptOwnership()).to.be.revertedWithCustomError(payout, 'NotOwner');
    await payout.connect(bob).acceptOwnership();
    expect(await payout.owner()).to.equal(bob.address);
  });

  it('activation contract: sponsor must be activated; approval is used up by the payment', async () => {
    const act = await (await ethers.getContractFactory('DAOvaultActivation')).deploy(await usdt.getAddress(), owner.address, usd(300));
    await usdt.mint(alice.address, usd(300));
    await usdt.mint(bob.address, usd(300));
    await usdt.connect(bob).approve(await act.getAddress(), usd(300));
    await expect(act.connect(bob).activate(alice.address)).to.be.revertedWithCustomError(act, 'InvalidSponsor');
    await usdt.connect(alice).approve(await act.getAddress(), usd(300));
    await act.connect(alice).activate(ethers.ZeroAddress);
    await act.connect(bob).activate(alice.address);
    expect(await act.sponsorOf(bob.address)).to.equal(alice.address);
    expect(await usdt.allowance(bob.address, await act.getAddress())).to.equal(0);
  });
});
