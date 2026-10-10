const { expect } = require('chai');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const usd = (n) => ethers.parseUnits(String(n), 18);
const ZERO = ethers.ZeroAddress;

describe('DAOvaultActivation', () => {
  let usdt, act, treasury, alice, bob, carol;
  const pay = async (who, sponsor) => {
    await usdt.mint(who.address, usd(300));
    await usdt.connect(who).approve(await act.getAddress(), usd(300));
    return act.connect(who).activate(sponsor);
  };

  beforeEach(async () => {
    [treasury, alice, bob, carol] = await ethers.getSigners();
    usdt = await (await ethers.getContractFactory('MockUSDT')).deploy();
    act = await (await ethers.getContractFactory('DAOvaultActivation')).deploy(await usdt.getAddress(), treasury.address, usd(300));
  });

  it('takes exactly $300 to the treasury and records the sponsor', async () => {
    await expect(pay(alice, ZERO)).to.emit(act, 'Activated');
    expect(await usdt.balanceOf(treasury.address)).to.equal(usd(300));
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

  it('refuses a sponsor that has not paid (and is not the treasury)', async () => {
    await expect(pay(bob, carol.address)).to.be.revertedWithCustomError(act, 'InvalidSponsor');
    expect(await act.isActivated(carol.address)).to.equal(false);
  });

  it('refuses self-sponsoring and a second activation', async () => {
    await expect(pay(alice, alice.address)).to.be.revertedWithCustomError(act, 'InvalidSponsor');
    await pay(alice, ZERO);
    await expect(pay(alice, ZERO)).to.be.revertedWithCustomError(act, 'AlreadyActivated');
  });

  it('top-up: an activated member pays another $300 to the treasury, counted per wallet', async () => {
    await pay(alice, treasury.address);
    await usdt.mint(alice.address, usd(300));
    await usdt.connect(alice).approve(await act.getAddress(), usd(300));
    await expect(act.connect(alice).topUp()).to.emit(act, 'ToppedUp').withArgs(alice.address, usd(300), 1, anyValue);
    expect(await usdt.balanceOf(treasury.address)).to.equal(usd(600));
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

  it('refuses when the $300 is not approved', async () => {
    await usdt.mint(alice.address, usd(300));
    await expect(act.connect(alice).activate(ZERO)).to.be.reverted;
    expect(await act.isActivated(alice.address)).to.equal(false);
  });
});

