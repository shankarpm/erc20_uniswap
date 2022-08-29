const { use, expect } = require('chai');
const { ethers, utils, ContractFactory, Contract } = require("ethers");
const { AddressZero } = require('ethers/constants');
const { solidity } = require('ethereum-waffle');

const { getCreate2Address } = require('./shared/utilities');
const UniswapV2Factory = require('../build/contracts/UniswapV2Factory.json');
const UniswapV2Pair = require('../build/contracts/UniswapV2Pair.json');
const fs = require('fs');

use(solidity);

const MNEMONIC = fs.readFileSync("../.secret").toString().trim();
const TEST_ADDRESSES = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000'
]

describe('UniswapV2Factory', () => {
  const provider = new ethers.providers.JsonRpcProvider(`https://rpc-mumbai.maticvigil.com`)
  const wallet = ethers.Wallet.fromMnemonic(MNEMONIC);
  const account = wallet.connect(provider);
  const secondWallet = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/1`);
  const secondAccount = secondWallet.connect(provider)

  let factory;
  beforeEach(async () => {
    const contract = new ContractFactory(UniswapV2Factory.abi, UniswapV2Factory.bytecode, account);
    factory = await contract.deploy(account.address);
  })

  it('feeTo, feeToSetter, allPairsLength', async () => {
    expect(await factory.feeTo()).to.eq(AddressZero)
    expect(await factory.feeToSetter()).to.eq(account.address)
    expect(await factory.allPairsLength()).to.eq(0)
  })

  async function createPair(tokens) {
    const bytecode = UniswapV2Pair.bytecode;
    const create2Address = getCreate2Address(factory.address, tokens, bytecode)
    let tx = await factory.createPair(...tokens)
    let receipt = await tx.wait()
    expect(receipt.events[0].event).to.eq('PairCreated')

    await expect(factory.createPair(...tokens)).to.be.reverted // UniswapV2: PAIR_EXISTS
    await expect(factory.createPair(...tokens.slice().reverse())).to.be.reverted // UniswapV2: PAIR_EXISTS
    expect(await factory.getPair(...tokens)).to.eq(create2Address)
    expect(await factory.getPair(...tokens.slice().reverse())).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = new Contract(create2Address, JSON.stringify(UniswapV2Pair.abi), provider)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  }

  it('createPair', async () => {
    await createPair(TEST_ADDRESSES)
  })

  it('createPair:reverse', async () => {
    await createPair(TEST_ADDRESSES.slice().reverse())
  })

  it('createPair:gas', async () => {
    const tx = await factory.createPair(...TEST_ADDRESSES)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(3258393)
  })

  it('setFeeTo', async () => {
    await expect(factory.connect(secondAccount).setFeeTo(secondAccount.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    const tx = await factory.setFeeTo(account.address)
    await tx.wait();
    expect(await factory.feeTo()).to.eq(account.address)
  })

  it('setFeeToSetter', async () => {
    await expect(factory.connect(secondAccount).setFeeToSetter(secondAccount.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    const tx = await factory.setFeeToSetter(secondAccount.address)
    await tx.wait();
    expect(await factory.feeToSetter()).to.eq(secondAccount.address)
    await expect(factory.setFeeToSetter(account.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
  })
})
