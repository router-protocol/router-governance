import chai, { expect } from 'chai'
import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'

import TreasuryVester from '../../build/TreasuryVester.json'
import TreasuryVesterFactory from '../../build/TreasuryVesterFactory.json'
import { governanceFixture } from '../fixtures'
import { mineBlock, expandTo18Decimals } from '../utils'

chai.use(solidity)

describe('scenario:TreasuryVester', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, wallet2] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let router: Contract
  let timelock: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(governanceFixture)
    router = fixture.router
    timelock = fixture.timelock
  })

  let treasuryVester: Contract
  let vestingAmount: BigNumber
  let vestingBegin: number
  let vestingCliff: number
  let bonus: number
  let vestingEnd: number
  let treasuryFactory: Contract

  let setup = async (options: any ) => {
    const { timestamp: now } = await provider.getBlock('latest')
    vestingAmount = expandTo18Decimals(100)
    vestingBegin = now + 60
    bonus = 0
    vestingCliff = vestingBegin
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365
    treasuryVester = await deployContract(wallet, TreasuryVester, [
      wallet2.address,
      router.address,
      timelock.address,
      vestingAmount,
      vestingCliff,
      vestingEnd,
      options.bonus || bonus
    ])
  
    // fund the treasury
    await router.transfer(treasuryVester.address, vestingAmount)
  }

  let setupFactory = async ()=>{
    treasuryFactory = await deployContract(wallet, TreasuryVesterFactory, [router.address])
  }
  // beforeEach('deploy treasury vesting contract', async () => {
  // })

  it('setRecipient:fail', async () => {
    await setup({})
    await expect(treasuryVester.setRecipient(wallet.address)).to.be.revertedWith(
      'TreasuryVester::setRecipient: unauthorized'
    )
  })

  it('claim:fail', async () => {
    await setup({})
    await expect(treasuryVester.claim()).to.be.revertedWith('TreasuryVester::claim: not time yet')
    await mineBlock(provider, vestingBegin - 10)
    await expect(treasuryVester.claim()).to.be.revertedWith('TreasuryVester::claim: not time yet')
  })

  it('rescue:fail', async () => {
    await setup({})
    await expect(treasuryVester.rescue()).to.be.revertedWith("TreasuryVester::onlyFactory: caller is not factory address")
  })

  it('claim:~half', async () => {
    await setup({})
    await mineBlock(provider, vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2))
    await treasuryVester.claim()
    const balance = await router.balanceOf(timelock.address)
    expect(vestingAmount.div(2).sub(balance).abs().lte(vestingAmount.div(2).div(10000))).to.be.true
  })

  it('claim:all', async () => {
    await setup({})
    await mineBlock(provider, vestingEnd)
    await treasuryVester.claim()
    const balance = await router.balanceOf(timelock.address)
    expect(balance).to.be.eq(vestingAmount)
  })

  it('claim:withBonus', async () => {
    let bonus = 30
    await setup({bonus})
    await mineBlock(provider, vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2))
    await treasuryVester.claim()
    const balance = await router.balanceOf(timelock.address)
    const bonusAmt = vestingAmount.mul(bonus).div(100)
    expect(balance.sub(bonusAmt.add(vestingAmount.sub(bonusAmt).div(2))).lte(0)).to.be.true
  })

  it('TreasuryFactory:vest', async () => {
    await setupFactory()
    vestingAmount = expandTo18Decimals(100)
    const { timestamp: now } = await provider.getBlock('latest')
    vestingBegin = now + 60
    bonus = 0
    vestingCliff = vestingBegin
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365

    await treasuryFactory.vest(
      timelock.address,
      vestingAmount,
      vestingCliff,
      vestingEnd,
      bonus
    )

    await router.transfer(treasuryFactory.address, vestingAmount)
    await treasuryFactory.notifyFundsForAll()
  })
  it('TreasuryFactory:batchVest', async () => {
    await setupFactory()
    vestingAmount = expandTo18Decimals(100)
    const { timestamp: now } = await provider.getBlock('latest')
    vestingBegin = now + 60
    bonus = 0
    vestingCliff = vestingBegin
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365

    await treasuryFactory.batchVest(
      [timelock.address, wallet2.address],
      [vestingAmount, vestingAmount],
      [vestingCliff, vestingCliff],
      [vestingEnd, vestingEnd],
      [bonus, 10]
    )
    let totalRewards = expandTo18Decimals(200)

    await router.transfer(treasuryFactory.address, totalRewards)
    await treasuryFactory.notifyFundsForAll()
    await mineBlock(provider, vestingEnd)
    await treasuryFactory.claimAll()
    let balance = await router.balanceOf(timelock.address)
    expect(balance).to.be.eq(vestingAmount)
    balance = await router.balanceOf(wallet2.address)
    expect(balance).to.be.eq(vestingAmount)
  })
  
  it('TreasuryFactory:claim', async () => {
    await setupFactory()
    vestingAmount = expandTo18Decimals(100)
    const { timestamp: now } = await provider.getBlock('latest')
    vestingBegin = now + 60
    bonus = 0
    vestingCliff = vestingBegin
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365

    await treasuryFactory.vest(
      timelock.address,
      vestingAmount,
      vestingCliff,
      vestingEnd,
      bonus
    )
    await router.transfer(treasuryFactory.address, vestingAmount)
    await treasuryFactory.notifyFundsForAll()
    await mineBlock(provider, vestingEnd)
    await treasuryFactory.claim(timelock.address)
    const balance = await router.balanceOf(timelock.address)
    expect(balance).to.be.eq(vestingAmount)
  })

  it('TreasuryFactory:claimAll', async () => {
    await setupFactory()
    vestingAmount = expandTo18Decimals(100)
    let { timestamp: now } = await provider.getBlock('latest')
    vestingBegin = now + 60
    bonus = 0
    vestingCliff = vestingBegin
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365

    await treasuryFactory.vest(
      timelock.address,
      vestingAmount,
      vestingCliff,
      vestingEnd,
      bonus
    )
    await router.transfer(treasuryFactory.address, vestingAmount)
    vestingAmount = expandTo18Decimals(100)
    let { timestamp: now2 } = await provider.getBlock('latest')
    vestingBegin = now2 + 60
    bonus = 0
    vestingCliff = vestingBegin
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365

    await treasuryFactory.vest(
      wallet2.address,
      vestingAmount,
      vestingCliff,
      vestingEnd,
      bonus
    )
    await router.transfer(treasuryFactory.address, vestingAmount)

    await treasuryFactory.notifyFundsForAll()
    await mineBlock(provider, vestingEnd)
    await treasuryFactory.claimAll()
    let balance = await router.balanceOf(timelock.address)
    expect(balance).to.be.eq(vestingAmount)
    balance = await router.balanceOf(wallet2.address)
    expect(balance).to.be.eq(vestingAmount)
  })
  it('TreasuryFactory:rescue', async () => {
    await setupFactory()
    vestingAmount = expandTo18Decimals(100)
    const { timestamp: now } = await provider.getBlock('latest')
    vestingBegin = now + 60
    bonus = 0
    vestingCliff = vestingBegin
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365

    await treasuryFactory.vest(
      timelock.address,
      vestingAmount,
      vestingCliff,
      vestingEnd,
      bonus
    )

    await router.transfer(treasuryFactory.address, vestingAmount)
    await treasuryFactory.notifyFundsForAll()
    let factoryBal = await router.balanceOf(treasuryFactory.address)
    expect(factoryBal).to.be.eq(expandTo18Decimals(0))
    await treasuryFactory.rescueFunds(timelock.address)
    factoryBal = await router.balanceOf(treasuryFactory.address)
    expect(factoryBal).to.be.eq(vestingAmount)
    let walletBal = await router.balanceOf(wallet.address)
    await treasuryFactory.rescueFactoryFunds()
    let updatedWalletBal = await router.balanceOf(wallet.address)
    expect(updatedWalletBal.sub(walletBal)).to.be.eq(vestingAmount)
    factoryBal = await router.balanceOf(treasuryFactory.address)
    expect(factoryBal).to.be.eq(expandTo18Decimals(0))
  })
})
