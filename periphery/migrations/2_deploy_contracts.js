const Router = artifacts.require("UniswapV2Router02");
const WETH = artifacts.require("MaticWETH");

module.exports = async function (deployer, network, accounts) {
    let Weth;
    //Modify this while deployinng
    const FACTORY_ADDRESS = '0xDb3a4CD28271190CC8C42c77947B4B89b1446F12';

    if (network == 'mainnet') {
        weth = await WETH.at('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619');
    } else {
        await deployer.deploy(WETH, accounts[0]);
        weth = await WETH.deployed();
    }
     
    await deployer.deploy(Router, FACTORY_ADDRESS, weth.address);
};