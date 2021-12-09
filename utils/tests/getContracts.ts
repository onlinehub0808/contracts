import { ethers } from "hardhat";

// Utils
import { chainlinkVars } from "../../utils/chainlink";

// Types
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Log } from "@ethersproject/abstract-provider";

// Contract types
import { Forwarder } from "../../typechain/Forwarder";
import { WETH9 } from "../../typechain/WETH9";
import { ControlDeployer } from "../../typechain/ControlDeployer";
import { Registry } from "../../typechain/Registry";
import { ProtocolControl } from "../../typechain/ProtocolControl";
import { AccessNFT } from "../../typechain/AccessNFT";
import { NFT } from "../../typechain/NFT";
import { Coin } from "../../typechain/Coin";
import { Pack } from "../../typechain/Pack";
import { Market } from "../../typechain/Market";
import { Marketplace } from "../../typechain/Marketplace";
import { LazyNFT } from "../../typechain/LazyNFT";
import { LazyMintERC1155 } from "typechain/LazyMintERC1155";

export type Contracts = {
  registry: Registry;
  forwarder: Forwarder;
  protocolControl: ProtocolControl;
  accessNft: AccessNFT;
  coin: Coin;
  pack: Pack;
  market: Market;
  marketv2: Marketplace;
  nft: NFT;
  lazynft: LazyNFT;
  weth: WETH9;
  lazyMintERC1155: LazyMintERC1155;
};

export async function getContracts(
  protocolProvider: SignerWithAddress,
  protocolAdmin: SignerWithAddress,
  networkName: string = "rinkeby",
): Promise<Contracts> {
  // Deploy Forwarder
  const forwarder: Forwarder = (await ethers
    .getContractFactory("Forwarder")
    .then(f => f.connect(protocolProvider).deploy())) as Forwarder;

  // Deploy ControlDeployer
  const controlDeployer: ControlDeployer = (await ethers
    .getContractFactory("ControlDeployer")
    .then(f => f.connect(protocolProvider).deploy())) as ControlDeployer;

  // Deploy Registry
  const registry: Registry = (await ethers.getContractFactory("Registry").then(f =>
    f.connect(protocolProvider).deploy(
      protocolProvider.address, // Protocol provider treasury.
      forwarder.address, // Forwarder address.
      controlDeployer.address, // ControlDeployer address.
    ),
  )) as Registry;

  // Grant `REGISTRY_ROLE` in ControlDeployer, to Registry.
  const REGISTRY_ROLE = await controlDeployer.REGISTRY_ROLE();
  await controlDeployer.connect(protocolProvider).grantRole(REGISTRY_ROLE, registry.address);

  // Deploy ProtocolControl via Registry.
  const protocolControlURI: string = "";
  const deployReceipt = await registry
    .connect(protocolAdmin)
    .deployProtocol(protocolControlURI)
    .then(tx => tx.wait());

  // Get ProtocolControl address
  const log = deployReceipt.logs.find(
    x => x.topics.indexOf(registry.interface.getEventTopic("NewProtocolControl")) >= 0,
  );
  const protocolControlAddr: string = registry.interface.parseLog(log as Log).args.controlAddress;

  // Get ProtocolControl contract.
  const protocolControl: ProtocolControl = (await ethers.getContractAt(
    "ProtocolControl",
    protocolControlAddr,
  )) as ProtocolControl;

  // Deploy Pack
  const { vrfCoordinator, linkTokenAddress, keyHash, fees } = chainlinkVars[networkName as keyof typeof chainlinkVars];
  const packContractURI: string = "";
  const pack: Pack = (await ethers
    .getContractFactory("Pack")
    .then(f =>
      f
        .connect(protocolAdmin)
        .deploy(
          protocolControl.address,
          packContractURI,
          vrfCoordinator,
          linkTokenAddress,
          keyHash,
          fees,
          forwarder.address,
          0,
        ),
    )) as Pack;

  // Deploy Market
  const marketContractURI: string = "";
  const market: Market = (await ethers
    .getContractFactory("Market")
    .then(f =>
      f.connect(protocolAdmin).deploy(protocolControl.address, forwarder.address, marketContractURI, 0),
    )) as Market;

  // Deploy WETH
  const weth: WETH9 = await ethers.getContractFactory("WETH9").then(f => f.deploy());
  
  // Deploy Marketplace
  const marketv2: Marketplace = (await ethers
    .getContractFactory("Marketplace")
    .then(f =>
      f.connect(protocolAdmin).deploy(protocolControl.address, forwarder.address, weth.address, marketContractURI, 0),
    )) as Marketplace;
  
  // Deploy LazyMintERC1155
  const baseURI: string = "ipfs://baseURI/";
  const contractURI: string = "ipfs://contractURI/";
  const trustedForwarderAddr: string = forwarder.address
  const nativeTokenWrapperAddr: string = weth.address
  const defaultSaleRecipient: string = protocolAdmin.address;

  const lazyMintERC1155: LazyMintERC1155 = await ethers.getContractFactory("LazyMintERC1155")
      .then(f => f.connect(protocolAdmin).deploy(
        baseURI,
        contractURI,
        trustedForwarderAddr,
        nativeTokenWrapperAddr,
        defaultSaleRecipient
      )) as LazyMintERC1155;

  // Deploy AccessNFT
  const accessNFTContractURI: string = "";
  const accessNft: AccessNFT = (await ethers
    .getContractFactory("AccessNFT")
    .then(f =>
      f.connect(protocolAdmin).deploy(protocolControl.address, forwarder.address, accessNFTContractURI, 0),
    )) as AccessNFT;

  // Get NFT contract
  const name: string = "name";
  const symbol: string = "SYMBOL";
  const nftContractURI: string = "";
  const nft: NFT = (await ethers
    .getContractFactory("NFT")
    .then(f =>
      f.connect(protocolAdmin).deploy(protocolControl.address, name, symbol, forwarder.address, nftContractURI, 0),
    )) as NFT;

  // Deploy Coin
  const coinName = "name";
  const coinSymbol = "SYMBOL";
  const coinURI = "";

  const coin: Coin = (await ethers
    .getContractFactory("Coin")
    .then(f =>
      f.connect(protocolAdmin).deploy(protocolControl.address, coinName, coinSymbol, forwarder.address, coinURI),
    )) as Coin;

  // Get NFT contract
  const lazyContractURI: string = "";
  const lazyBaseURI: string = "ipfs://baseuri/";
  const lazyMaxSupply = 420;
  const lazynft: LazyNFT = (await ethers.getContractFactory("LazyNFT").then(f =>
    f.connect(protocolAdmin).deploy(
      protocolControl.address,
      name,
      symbol,
      forwarder.address,
      lazyContractURI,
      lazyBaseURI,
      lazyMaxSupply,
      0, // royalty
      0, // fee
      protocolControl.address, // sale recipient
    ),
  )) as LazyNFT;

  return {
    registry,
    weth,
    forwarder,
    protocolControl,
    pack,
    market,
    marketv2,
    accessNft,
    coin,
    nft,
    lazynft,
    lazyMintERC1155
  };
}
