const { ethers, utils, ContractFactory, Contract } = require("ethers");
const ERC20 = require('../build/contracts/ERC20Test.json');

const { expect, use } = require('chai');
const { MaxUint256 } = require('ethers/constants');
const { bigNumberify, hexlify, keccak256, defaultAbiCoder, toUtf8Bytes }  = require('ethers/utils');
const { solidity } = require('ethereum-waffle');
const { ecsign } = require('ethereumjs-util');

const { expandTo18Decimals, getApprovalDigest } = require('./shared/utilities');
const fs = require('fs');
use(solidity);

const MNEMONIC = fs.readFileSync("../.secret").toString().trim();
const TOTAL_SUPPLY = expandTo18Decimals(10000)
const TEST_AMOUNT = expandTo18Decimals(10)

describe('UniswapV2ERC20', () => {
    const provider = new ethers.providers.JsonRpcProvider(`https://rpc-mumbai.maticvigil.com`)
    const wallet = ethers.Wallet.fromMnemonic(MNEMONIC);
    const account = wallet.connect(provider);
    const secondWallet = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/1`);
    const secondAccount = secondWallet.connect(provider)
    const signer = provider.getSigner(account.address);

  let token;
  beforeEach(async () => {
    const factory = new ContractFactory(ERC20.abi, ERC20.bytecode, account);

    token = await factory.deploy(TOTAL_SUPPLY);
    console.log("token", token.address);
  })

  it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
    const name = await token.name()
    expect(name).to.eq('Uniswap V2')
    expect(await token.symbol()).to.eq('UNI-V2')
    expect(await token.decimals()).to.eq(18)
    expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY)
    expect(await token.balanceOf(account.address)).to.eq(TOTAL_SUPPLY)
    expect(await token.DOMAIN_SEPARATOR()).to.eq(
      keccak256(
        defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [
            keccak256(
              toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
            ),
            keccak256(toUtf8Bytes(name)),
            keccak256(toUtf8Bytes('1')),
            80001,         
            token.address
          ]
        )
      )
    )
    expect(await token.PERMIT_TYPEHASH()).to.eq(
      keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
    )
  })

  it('approve', async () => {
    const tx = await token.approve(secondAccount.address, TEST_AMOUNT)
    const receipt = await tx.wait()
    expect(receipt.events[0].event).to.eq('Approval');
    expect(await token.allowance(account.address, secondAccount.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer', async () => {
    const tx = await token.transfer(secondAccount.address, TEST_AMOUNT)
    const receipt = await tx.wait()
    expect(receipt.events[0].event).to.eq('Transfer');
    expect(await token.balanceOf(account.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(secondAccount.address)).to.eq(TEST_AMOUNT)
  })

   it('transfer:fail', async () => {
    await expect(token.transfer(secondAccount.address, TOTAL_SUPPLY.add(1))).to.be.reverted // ds-math-sub-underflow
    await expect(token.connect(secondAccount).transfer(account.address, 1)).to.be.reverted // ds-math-sub-underflow
  })

  it('transferFrom', async () => {
    let tx = await token.approve(secondAccount.address, TEST_AMOUNT)
    let receipt = await tx.wait()
    tx = await token.connect(secondAccount).transferFrom(account.address, secondAccount.address, TEST_AMOUNT)
    receipt = await tx.wait()
    expect(receipt.events[0].event).to.eq('Transfer');
    expect(await token.allowance(account.address, secondAccount.address)).to.eq(0)
    expect(await token.balanceOf(account.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(secondAccount.address)).to.eq(TEST_AMOUNT)
  })

  it('transferFrom:max', async () => {
    let tx = await token.approve(secondAccount.address, MaxUint256)
    receipt = await tx.wait()
    tx = await token.connect(secondAccount).transferFrom(account.address, secondAccount.address, TEST_AMOUNT)
    receipt = await tx.wait()
    expect(receipt.events[0].event).to.eq('Transfer');
    expect(await token.allowance(account.address, secondAccount.address)).to.eq(MaxUint256)
    expect(await token.balanceOf(account.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(secondAccount.address)).to.eq(TEST_AMOUNT)
  })

  it('permit', async () => {
    const nonce = await token.nonces(account.address)
    const deadline = MaxUint256
    const digest = await getApprovalDigest(
      token,
      { owner: account.address, spender: secondAccount.address, value: TEST_AMOUNT },
      nonce,
      deadline
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(account.privateKey.slice(2), 'hex'))

    const tx = await token.permit(account.address, secondAccount.address, TEST_AMOUNT, deadline, v, hexlify(r), hexlify(s))
    const receipt = await tx.wait()
    expect(receipt.events[0].event).to.eq('Approval');
    expect(await token.allowance(account.address, secondAccount.address)).to.eq(TEST_AMOUNT)
    expect(await token.nonces(account.address)).to.eq(bigNumberify(1))
  })
})
