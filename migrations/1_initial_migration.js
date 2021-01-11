const Route = artifacts.require("Route");

module.exports = async (deployer) => {
  await deployer.deploy(Route)
};
