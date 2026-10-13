const { expect } = require('chai');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const usd = (n) => ethers.parseUnits(String(n), 18);
const ZERO = ethers.ZeroAddress;

describe('DAOvaultActivation', () => {
  let usdt, act, treasury, alice, bob, carol, vault;
  const pay = async (who, sponsor) => {
    await usdt.mint(who.address, usd(300));
    await usdt.connect(who).approve(await act.getAddress(), usd(300));
    return act.connect(who).activate(sponsor);
  };

  beforeEach(async () => {
    [treasury, alice, bob, carol, vault] = await ethers.getSigners();
    usdt = await (await ethers.getContractFactory('MockUSDT')).deploy();
    act = await (await ethers.getContractFactory('DAOvaultActivation')).deploy(await usdt.getAddress(), treasury.address, vault.address, usd(300));
  });

  it('takes exactly $300: 45% ($135) to the payout contract, 55% ($165) to the treasury; records the sponsor', async () => {
    await expect(pay(alice, ZERO)).to.emit(act, 'Activated');
    expect(await usdt.balanceOf(vault.address)).to.equal(usd(135));
    expect(await usdt.balanceOf(treasury.address)).to.equal(usd(165));
    expect(await usdt.balanceOf(alice.address)).to.equal(0);
    expect(await act.isActivated(alice.address)).to.equal(true);
    await expect(pay(bob, alice.address)).to.emit(act, 'Activated');
    expect(await act.sponsorOf(bob.address)).to.equal(alice.address);
  });

  it('the treasury is the root: activated without paying, anyone can join under it', async () => {
    expect(await act.isActivated(treasury.address)).to.equal(true);
    expect(await act.activated(treasury.address)).to.equal(false); // never a paid member
    await expect(pay(alice, treasury.address)).to.emit(act, 'Activated').withArgs(alice.address, treasury.address, usd(300), anyValue);
    expect(await act.sponsorOf(alice.address)).to.equal(treasury.address);
  });

  it('the treasury cannot activate itself (it is never under someone else)', async () => {
    await usdt.mint(treasury.address, usd(300));
    await usdt.connect(treasury).approve(await act.getAddress(), usd(300));
    await expect(act.connect(treasury).activate(ZERO)).to.be.revertedWithCustomError(act, 'TreasuryIsRoot');
    await pay(alice, ZERO);
    await expect(act.connect(treasury).activate(alice.address)).to.be.revertedWithCustomError(act, 'TreasuryIsRoot');
  });

  it('accepts a sponsor that has not paid yet (pre-launch teams), without activating that sponsor', async () => {
    await expect(pay(bob, carol.address)).to.emit(act, 'Activated').withArgs(bob.address, carol.address, usd(300), anyValue);
    expect(await act.sponsorOf(bob.address)).to.equal(carol.address);
    expect(await act.isActivated(carol.address)).to.equal(false); // paying for a team never activates the sponsor
    await expect(pay(carol, alice.address)).to.emit(act, 'Activated'); // carol can still pay later, under anyone
  });

  it('refuses self-sponsoring and a second activation', async () => {
    await expect(pay(alice, alice.address)).to.be.revertedWithCustomError(act, 'InvalidSponsor');
    await pay(alice, ZERO);
    await expect(pay(alice, ZERO)).to.be.revertedWithCustomError(act, 'AlreadyActivated');
  });

  it('top-up: an activated member pays another $300 (same 45/55 split), counted per wallet', async () => {
    await pay(alice, treasury.address);
    await usdt.mint(alice.address, usd(300));
    await usdt.connect(alice).approve(await act.getAddress(), usd(300));
    await expect(act.connect(alice).topUp()).to.emit(act, 'ToppedUp').withArgs(alice.address, usd(300), 1, anyValue);
    expect(await usdt.balanceOf(vault.address)).to.equal(usd(270));
    expect(await usdt.balanceOf(treasury.address)).to.equal(usd(330));
    expect(await act.topUps(alice.address)).to.equal(1);
    expect(await act.sponsorOf(alice.address)).to.equal(treasury.address); // position unchanged
  });

  it('top-up: refused for a wallet that never activated, for the treasury, and without approval', async () => {
    await usdt.mint(bob.address, usd(300));
    await usdt.connect(bob).approve(await act.getAddress(), usd(300));
    await expect(act.connect(bob).topUp()).to.be.revertedWithCustomError(act, 'NotActivated');
    await expect(act.connect(treasury).topUp()).to.be.revertedWithCustomError(act, 'NotActivated');
    await pay(alice, ZERO);
    await expect(act.connect(alice).topUp()).to.be.reverted; // no fresh approval: the first $300 used it up
    expect(await act.topUps(alice.address)).to.equal(0);
  });

  it('refuses a missing or treasury payout address at deploy', async () => {
    const F = await ethers.getContractFactory('DAOvaultActivation');
    await expect(F.deploy(await usdt.getAddress(), treasury.address, ZERO, usd(300))).to.be.revertedWithCustomError(F, 'InvalidAddress');
    await expect(F.deploy(await usdt.getAddress(), treasury.address, treasury.address, usd(300))).to.be.revertedWithCustomError(F, 'InvalidAddress');
    expect(await act.payoutVault()).to.equal(vault.address);
    expect(await act.PAYOUT_SHARE_BPS()).to.equal(4500);
  });

  it('with the real payout contract: 45% of each activation becomes withdrawal float', async () => {
    const [, , , , , owner, signer] = await ethers.getSigners();
    const payout = await (await ethers.getContractFactory('DAOvaultPayout')).deploy(await usdt.getAddress(), owner.address, signer.address, usd(500), usd(5000));
    const act2 = await (await ethers.getContractFactory('DAOvaultActivation')).deploy(await usdt.getAddress(), treasury.address, await payout.getAddress(), usd(300));
    await usdt.mint(alice.address, usd(300));
    await usdt.connect(alice).approve(await act2.getAddress(), usd(300));
    await act2.connect(alice).activate(ZERO);
    expect(await payout.floatBalance()).to.equal(usd(135));
    expect(await usdt.balanceOf(treasury.address)).to.equal(usd(165));
  });

  it('refuses when the $300 is not approved', async () => {
    await usdt.mint(alice.address, usd(300));
    await expect(act.connect(alice).activate(ZERO)).to.be.reverted;
    expect(await act.isActivated(alice.address)).to.equal(false);
  });
});

