const { expect, use } = require('chai');
const { ethers, utils, ContractFactory, Contract } = require("ethers");
const { solidity } = require('ethereum-waffle');
const { BigNumber, bigNumberify } = require('ethers/utils');
const UniswapV2Factory = require('../build/contracts/UniswapV2Factory.json');
const ERC20 = require('../build/contracts/ERC20Test.json');
const UniswapV2Pair = require('../build/contracts/UniswapV2Pair.json');
const { expandTo18Decimals } = require('./shared/utilities');

const fs = require('fs');

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)
const MNEMONIC = fs.readFileSync("../.secret").toString().trim();

use(solidity);

const overrides = {
 gasLimit: 9999999
}

describe('UniswapV2PairTest', () => {
 const provider = new ethers.providers.JsonRpcProvider(`https://rpc-mumbai.maticvigil.com`)
 const wallet = ethers.Wallet.fromMnemonic(MNEMONIC);
 const account = wallet.connect(provider);
 const secondWallet = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/1`);
 const secondAccount = secondWallet.connect(provider)
 const signer = provider.getSigner(account.address);

 let factory;
 let token0;
 let token1;
 let pair;
 beforeEach(async () => {
    const factoryContract = new ContractFactory(UniswapV2Factory.abi, UniswapV2Factory.bytecode, account);
    factory = await factoryContract.deploy(account.address);
    console.log("factory", factory.address)
   
    const tokenAContract = new ContractFactory(ERC20.abi, ERC20.bytecode, account);
    const tokenA = await tokenAContract.deploy(expandTo18Decimals(10000));
    const tokenBContract = new ContractFactory(ERC20.abi, ERC20.bytecode, account);
    const tokenB = await tokenBContract.deploy(expandTo18Decimals(10000));
    let tx = await factory.createPair(tokenA.address, tokenB.address, overrides)
    let receipt = await tx.wait();
    const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
    pair = new Contract(pairAddress, UniswapV2Pair.abi, provider).connect(account)
    token0 = tokenA < tokenB ? tokenA : tokenB
    token1 = tokenA < tokenB ? tokenB : tokenA
    console.log("Pair",pair.address)
    console.log("token0", token0.address)
    console.log("token1", token1.address)
 })

 it('mint', async () => {
   const token0Amount = expandTo18Decimals(1)
   const token1Amount = expandTo18Decimals(4)
   let tx = await token0.transfer(pair.address, token0Amount)
   await tx.wait();
   tx = await token1.transfer(pair.address, token1Amount)
   await tx.wait();

   const expectedLiquidity = expandTo18Decimals(2)
   tx = await pair.mint(account.address, overrides)
   const receipt = await tx.wait();
   expect(receipt.events[0].event).to.eq('Transfer')
   expect(receipt.events[1].event).to.eq('Transfer')
   expect(receipt.events[2].event).to.eq('Sync')
   expect(receipt.events[3].event).to.eq('Mint')

   expect(await pair.totalSupply()).to.eq(expectedLiquidity)
   expect(await pair.balanceOf(account.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
   expect(await token0.balanceOf(pair.address)).to.eq(token0Amount)
   expect(await token1.balanceOf(pair.address)).to.eq(token1Amount)
   const reserves = await pair.getReserves()  
   expect(reserves[0]).to.eq(token0Amount)
   expect(reserves[1]).to.eq(token1Amount)
 })

 async function addLiquidity(token0Amount, token1Amount) {
   let tx = await token0.transfer(pair.address, token0Amount)
   await tx.wait();
   tx = await token1.transfer(pair.address, token1Amount)
   await tx.wait();
   tx = await pair.mint(account.address, overrides)
   await tx.wait();
  
 }
 const swapTestCases = [
   [1, 5, 10, '1662497915624478906'],
   [1, 10, 5, '453305446940074565'],

   [2, 5, 10, '2851015155847869602'],
   [2, 10, 5, '831248957812239453'],

   [1, 10, 10, '906610893880149131'],
   [1, 100, 100, '987158034397061298'],
   [1, 1000, 1000, '996006981039903216']
 ].map(a => a.map(n => (typeof n === 'string' ? bigNumberify(n) : expandTo18Decimals(n))))
 swapTestCases.forEach((swapTestCase, i) => {
   it(`getInputPrice:${i}`, async () => {
     const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
     await addLiquidity(token0Amount, token1Amount)
     let tx = await token0.transfer(pair.address, swapAmount)
     await tx.wait()
     tx = await pair.swap(0, expectedOutputAmount, account.address, '0x', overrides)
   })
 })

 const optimisticTestCases = [
   ['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
   ['997000000000000000', 10, 5, 1],
   ['997000000000000000', 5, 5, 1],
   [1, 5, 5, '1003009027081243732'] // given amountOut, amountIn = ceiling(amountOut / .997)
 ].map(a => a.map(n => (typeof n === 'string' ? bigNumberify(n) : expandTo18Decimals(n))))
 optimisticTestCases.forEach((optimisticTestCase, i) => {
   it(`optimistic:${i}`, async () => {
     const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
     await addLiquidity(token0Amount, token1Amount)
     let tx = await token0.transfer(pair.address, inputAmount)
     await tx.wait()

     await pair.swap(outputAmount, 0, account.address, '0x', overrides)
   })
 })

 it('swap:token0', async () => {
   const token0Amount = expandTo18Decimals(5)
   const token1Amount = expandTo18Decimals(10)
   await addLiquidity(token0Amount, token1Amount)

   const swapAmount = expandTo18Decimals(1)
   const expectedOutputAmount = bigNumberify('1662497915624478906')
   let tx = await token0.transfer(pair.address, swapAmount)
   await tx.wait()
   let swapTx = await pair.swap(0, expectedOutputAmount, account.address, '0x', overrides)
   const receipt = await swapTx.wait()
   expect(receipt.events[0].event).to.eq('Transfer')
   expect(receipt.events[1].event).to.eq('Sync')
   expect(receipt.events[2].event).to.eq('Swap')

   const reserves = await pair.getReserves()
   expect(reserves[0]).to.eq(token0Amount.add(swapAmount))
   expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount))
   expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.add(swapAmount))
   expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.sub(expectedOutputAmount))
   const totalSupplyToken0 = await token0.totalSupply()
   const totalSupplyToken1 = await token1.totalSupply()
   expect(await token0.balanceOf(account.address)).to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount))
   expect(await token1.balanceOf(account.address)).to.eq(totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount))
 })

 it('swap:token1', async () => {
   const token0Amount = expandTo18Decimals(5)
   const token1Amount = expandTo18Decimals(10)
   await addLiquidity(token0Amount, token1Amount)

   const swapAmount = expandTo18Decimals(1)
   const expectedOutputAmount = bigNumberify('453305446940074565')
   let tx = await token1.transfer(pair.address, swapAmount)
   await tx.wait()
   tx = await pair.swap(expectedOutputAmount, 0, account.address, '0x', overrides)
   const receipt = await tx.wait()
   expect(receipt.events[0].event).to.eq('Transfer')
   expect(receipt.events[1].event).to.eq('Sync')
   expect(receipt.events[2].event).to.eq('Swap')

   const reserves = await pair.getReserves()
   expect(reserves[0]).to.eq(token0Amount.sub(expectedOutputAmount))
   expect(reserves[1]).to.eq(token1Amount.add(swapAmount))
   expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.sub(expectedOutputAmount))
   expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.add(swapAmount))
   const totalSupplyToken0 = await token0.totalSupply()
   const totalSupplyToken1 = await token1.totalSupply()
   expect(await token0.balanceOf(account.address)).to.eq(totalSupplyToken0.sub(token0Amount).add(expectedOutputAmount))
   expect(await token1.balanceOf(account.address)).to.eq(totalSupplyToken1.sub(token1Amount).sub(swapAmount))
 })

 it('swap:gas', async () => {
   const token0Amount = expandTo18Decimals(5)
   const token1Amount = expandTo18Decimals(10)
   await addLiquidity(token0Amount, token1Amount)
   await pair.sync(overrides)

   const swapAmount = expandTo18Decimals(1)
   const expectedOutputAmount = bigNumberify('453305446940074565')
   tx = await token1.transfer(pair.address, swapAmount)
   await tx.wait()

   tx = await pair.swap(expectedOutputAmount, 0, account.address, '0x', overrides)
   const receipt = await tx.wait()
   expect(receipt.gasUsed).to.eq(75417)
 })

 it('burn', async () => {
   const token0Amount = expandTo18Decimals(3)
   const token1Amount = expandTo18Decimals(3)
   await addLiquidity(token0Amount, token1Amount)

   const expectedLiquidity = expandTo18Decimals(3)
   let tx = await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
   await tx.wait()

   tx = await pair.burn(account.address, overrides)
   const receipt = await tx.wait()

   expect(receipt.events[0].event).to.eq('Transfer')
   expect(receipt.events[1].event).to.eq('Transfer')
   expect(receipt.events[2].event).to.eq('Transfer')
   expect(receipt.events[3].event).to.eq('Sync')
   expect(receipt.events[4].event).to.eq('Burn')

   expect(await pair.balanceOf(account.address)).to.eq(0)
   expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
   expect(await token0.balanceOf(pair.address)).to.eq(1000)
   expect(await token1.balanceOf(pair.address)).to.eq(1000)
   const totalSupplyToken0 = await token0.totalSupply()
   const totalSupplyToken1 = await token1.totalSupply()
   expect(await token0.balanceOf(account.address)).to.eq(totalSupplyToken0.sub(1000))
   expect(await token1.balanceOf(account.address)).to.eq(totalSupplyToken1.sub(1000))
 })


 it('feeTo:off', async () => {
   const token0Amount = expandTo18Decimals(1000)
   const token1Amount = expandTo18Decimals(1000)
   await addLiquidity(token0Amount, token1Amount)

   const swapAmount = expandTo18Decimals(1)
   const expectedOutputAmount = bigNumberify('996006981039903216')
   let tx = await token1.transfer(pair.address, swapAmount)
   await tx.wait()
   tx = await pair.swap(expectedOutputAmount, 0, account.address, '0x', overrides)
   await tx.wait()

   const expectedLiquidity = expandTo18Decimals(1000)
   tx = await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
   await tx.wait()
   tx = await pair.burn(account.address, overrides)
   await tx.wait()
   expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
 })

 it('feeTo:on', async () => {
   let tx = await factory.setFeeTo(secondAccount.address)
   await tx.wait()

   const token0Amount = expandTo18Decimals(1000)
   const token1Amount = expandTo18Decimals(1000)
   await addLiquidity(token0Amount, token1Amount)

   const swapAmount = expandTo18Decimals(1)
   const expectedOutputAmount = bigNumberify('996006981039903216')
   let token1Tx = await token1.transfer(pair.address, swapAmount)
   await token1Tx.wait()
   let token2Tx = await pair.swap(expectedOutputAmount, 0, account.address, '0x', overrides)
   await token2Tx.wait()

   const expectedLiquidity = expandTo18Decimals(1000)
   let transferTx = await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
   await transferTx.wait()
   let burnTx = await pair.burn(account.address, overrides)
   await burnTx.wait()
   expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY.add('249750499251388'))
   expect(await pair.balanceOf(secondAccount.address)).to.eq('249750499251388')

   // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
   // ...because the initial liquidity amounts were equal
   expect(await token0.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('249501683697445'))
   expect(await token1.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('250000187312969'))
 })
})
