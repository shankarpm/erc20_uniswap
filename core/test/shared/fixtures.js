const { Contract, Wallet } = require('ethers');
const { Web3Provider } = require('ethers/providers');
const { deployContract } = require('ethereum-waffle');
const { expandTo18Decimals } = require('./utilities');
const ERC20 = require('../../build/contracts/ERC20Test.json');
const UniswapV2Factory = require('../../build/contracts/UniswapV2Factory.json');
const UniswapV2Pair = require('../../build/contracts/UniswapV2Pair.json');

const overrides = {
  gasLimit: 9999999
}

module.exports.factoryFixture = async function factoryFixture(provider, [wallet, other]) {
  const factory = await deployContract(wallet, UniswapV2Factory, [wallet.address], overrides)
  return { factory };
}

module.exports.pairFixture = async function pairFixture(provider, [wallet, other]) {
  const factory = await deployContract(wallet, UniswapV2Factory, [wallet.address], overrides)

  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)

  await factory.createPair(tokenA.address, tokenB.address, overrides)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(UniswapV2Pair.abi), provider).connect(wallet)

  const token0Address = (await pair.token0()).address
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { factory, token0, token1, pair }
}