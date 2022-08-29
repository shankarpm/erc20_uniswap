const Factory = artifacts.require("UniswapV2Factory");

module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(Factory, accounts[0]);
};