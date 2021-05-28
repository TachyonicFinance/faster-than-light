import { waffleChai } from '@ethereum-waffle/chai'
import { ethers, waffle } from 'hardhat'
import { use, expect } from 'chai'
// eslint-disable-next-line no-unused-vars
import { BN } from '@openzeppelin/test-helpers'
import ABDKMathQuad from '../artifacts/contracts/abdk-libraries-solidity/ABDKMathQuad.sol/ABDKMathQuad.json'
import YieldFarming from '../artifacts/contracts/YieldFarming.sol/YieldFarming.json'
import ERC20Mock from '../artifacts/contracts/ERC20Mock.sol/ERC20Mock.json'
import Timestamp from '../artifacts/contracts/Timestamp.sol/Timestamp.json'
use(waffleChai)

const MULTIPLIER = 1E12

class Record {
  constructor (address, shares) {
    this.address = address
    this.shares = shares
  }
}

const mockedDeploy = async (_multiplier) => {
  const LOCK_TIME = 1
  const INITIAL_BALANCE = 1000
  const DEPLOY_TIMESTAMP = 1
  const DEPOSIT_TIMESTAMP = DEPLOY_TIMESTAMP + 24 * 60 * 60 // one day later
  const UNLOCK_TIMESTAMP = DEPOSIT_TIMESTAMP + 24 * 60 * 60 // one day later
  const TIMESTAMPS = { DEPLOY: DEPLOY_TIMESTAMP, DEPOSIT: DEPOSIT_TIMESTAMP, UNLOCK: UNLOCK_TIMESTAMP }
  const MULTIPLIER = _multiplier
  const INTEREST_NUMERATOR = 25
  const INTEREST_DENOMINATOR = 10000
  const INTEREST = { NUMERATOR: INTEREST_NUMERATOR, DENOMINATOR: INTEREST_DENOMINATOR }
  const TOKEN_NAME = 'A Token name'
  const TOKEN_SYMBOL = 'A Token symbol'
  const TOKEN = { NAME: TOKEN_NAME, SYMBOL: TOKEN_SYMBOL }
  const constants = { MULTIPLIER, LOCK_TIME, INITIAL_BALANCE, INTEREST, TIMESTAMPS, TOKEN }
  const [first, second, third] = waffle.provider.getWallets()
  const payees = [
    new Record(first.address, 100),
    new Record(second.address, 100),
    new Record(third.address, 100)
  ]
  const timestamp = await waffle.deployMockContract(first, Timestamp.abi)
  await timestamp.mock.getTimestamp.returns(constants.TIMESTAMPS.DEPLOY)
  expect(await timestamp.getTimestamp()).to.be.bignumber.equal(constants.TIMESTAMPS.DEPLOY)
  const acceptedToken = await waffle.deployContract(first, ERC20Mock, [
    'ERC20Mock name',
    'ERC20Mock symbol',
    first.address,
    constants.INITIAL_BALANCE])
  return await rawDeploy(timestamp, acceptedToken, payees, [first, second, third], constants)
}

const rawDeploy = async (timestamp, acceptedToken, payees, accounts, constants) => {
  const [first, second, third] = accounts
  const aBDKMath = await waffle.deployContract(first, ABDKMathQuad)
  const RewardCalculator = await ethers.getContractFactory(
    'RewardCalculator',
    {
      libraries: {
        ABDKMathQuad: aBDKMath.address
      }
    }
  )
  const rewardCalculator = await RewardCalculator.deploy()
  const interestRate = await aBDKMath.div(
    await aBDKMath.fromInt(constants.INTEREST.NUMERATOR),
    await aBDKMath.fromInt(constants.INTEREST.DENOMINATOR)
  )
  const multiplier = await aBDKMath.fromInt(constants.MULTIPLIER)
  const yieldFarming = await waffle.deployContract(first, YieldFarming, [
    timestamp.address,
    acceptedToken.address,
    rewardCalculator.address,
    constants.TOKEN.NAME,
    constants.TOKEN.SYMBOL,
    interestRate,
    multiplier,
    constants.LOCK_TIME,
    payees.map((payee) => { return payee.address }),
    payees.map((payee) => { return payee.shares })
  ])
  const YieldFarmingToken = await ethers.getContractFactory('YieldFarmingToken')
  const yieldFarmingToken = await YieldFarmingToken.attach(await yieldFarming.yieldFarmingToken())
  return { acceptedToken, rewardCalculator, first, second, third, yieldFarming, yieldFarmingToken, timestamp, payees, constants }
}

export { mockedDeploy, rawDeploy, Timestamp, waffle, expect, ethers, MULTIPLIER, Record }