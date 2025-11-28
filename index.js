import blessed from "blessed";
import chalk from "chalk";
import figlet from "figlet";
import { ethers } from "ethers";
import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
const ICARUS_RPC_URL = "https://testnet.riselabs.xyz";
const ICARUS_CHAIN_ID = 11155931;
const ROUTER_ADDRESS = "0xA33BE72Bf5f5fA7B98c104cFB56cE83072d872dE";
const LIQ_ROUTER_ADDRESS = "0x93f504193778ebe3cC7986D85E02502B46e616D7";
const RISE_ADDRESS = "0xd6e1afe5cA8D00A2EFC01B89997abE2De47fdfAf";
const USDT_ADDRESS = "0x40918Ba7f132E0aCba2CE4de4c4baF9BD2D7D849";
const USDC_ADDRESS = "0x8A93d247134d91e0de6f96547cB0204e5BE8e5D8";
const WBTC_ADDRESS = "0xF32D39ff9f6Aa7a7A64d7a4F00a54826Ef791a55";
const CONFIG_FILE = "config.json";
const isDebug = false;
const directions = [
  { chain: "icarus", rpc: ICARUS_RPC_URL, chainId: ICARUS_CHAIN_ID }
];
const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];
const ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs) payable"
];
const LIQ_ROUTER_ABI = [
  "function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function quoteAddLiquidity(address tokenA, address tokenB, bool stable, address _factory, uint256 amountADesired, uint256 amountBDesired) view returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function defaultFactory() view returns (address)",
  "function getReserves(address tokenA, address tokenB, bool stable, address _factory) view returns (uint256 reserveA, uint256 reserveB)"
];

const tokenNames = {
  "ETH": "ETH",
  [RISE_ADDRESS]: "RISE",
  [USDT_ADDRESS]: "USDT",
  [USDC_ADDRESS]: "USDC",
  [WBTC_ADDRESS]: "WBTC"
};

const LIQ_PAIRS = [
  { tokenA: USDT_ADDRESS, tokenB: USDC_ADDRESS, stable: true, primary: { address: USDT_ADDRESS, decimals: 6, range: "usdtLiqRange" }, secondary: { address: USDC_ADDRESS, decimals: 6 } },
  { tokenA: USDT_ADDRESS, tokenB: RISE_ADDRESS, stable: false, primary: { address: USDT_ADDRESS, decimals: 6, range: "usdtLiqRange" }, secondary: { address: RISE_ADDRESS, decimals: 18 } },
  { tokenA: USDC_ADDRESS, tokenB: WBTC_ADDRESS, stable: false, primary: { address: USDC_ADDRESS, decimals: 6, range: "usdcLiqRange" }, secondary: { address: WBTC_ADDRESS, decimals: 18 } },
];
let walletInfo = {
  address: "N/A",
  balanceETH: "0.0000",
  balanceRISE: "0.0000",
  balanceUSDT: "0.0000",
  balanceUSDC: "0.0000",
  activeAccount: "N/A"
};
let transactionLogs = [];
let activityRunning = false;
let isCycleRunning = false;
let shouldStop = false;
let dailyActivityInterval = null;
let accounts = [];
let proxies = [];
let selectedWalletIndex = 0;
let loadingSpinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const borderBlinkColors = ["cyan", "blue", "magenta", "red", "yellow", "green"];
let borderBlinkIndex = 0;
let blinkCounter = 0;
let spinnerIndex = 0;
let nonceTracker = {};
let hasLoggedSleepInterrupt = false;
let isHeaderRendered = false;
let activeProcesses = 0;
let dailyActivityConfig = {
  swapRepetitions: 1,
  addLiqRepetitions: 1,
  riseSwapRange: { min: 1, max: 3 },
  ethSwapRange: { min: 0.00005, max: 0.0001 },
  usdtSwapRange: { min: 0.1, max: 0.5 },
  usdcSwapRange: { min: 0.1, max: 0.5 },
  usdtLiqRange: { min: 0.1, max: 0.2 },
  loopHours: 24
};
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
];
const Headers = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json',
  'origin': 'https://www.icarus.finance',
  'referer': 'https://www.icarus.finance/'
};
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf8");
      const config = JSON.parse(data);
      dailyActivityConfig.swapRepetitions = Number(config.swapRepetitions) || 1;
      dailyActivityConfig.addLiqRepetitions = Number(config.addLiqRepetitions) || 1;
      dailyActivityConfig.riseSwapRange.min = Number(config.riseSwapRange?.min) || 1;
      dailyActivityConfig.riseSwapRange.max = Number(config.riseSwapRange?.max) || 3;
      dailyActivityConfig.ethSwapRange.min = Number(config.ethSwapRange?.min) || 0.00005;
      dailyActivityConfig.ethSwapRange.max = Number(config.ethSwapRange?.max) || 0.0001;
      dailyActivityConfig.usdtSwapRange.min = Number(config.usdtSwapRange?.min) || 0.1;
      dailyActivityConfig.usdtSwapRange.max = Number(config.usdtSwapRange?.max) || 0.5;
      dailyActivityConfig.usdcSwapRange.min = Number(config.usdcSwapRange?.min) || 0.1;
      dailyActivityConfig.usdcSwapRange.max = Number(config.usdcSwapRange?.max) || 0.5;
      dailyActivityConfig.usdtLiqRange.min = Number(config.usdtLiqRange?.min) || 0.1;
      dailyActivityConfig.usdtLiqRange.max = Number(config.usdtLiqRange?.max) || 0.2;
      dailyActivityConfig.loopHours = Number(config.loopHours) || 24;
    } else {
      addLog("No config file found, using default settings.", "info");
    }
  } catch (error) {
    addLog(`Failed to load config: ${error.message}`, "error");
  }
}
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(dailyActivityConfig, null, 2));
    addLog("Configuration saved successfully.", "success");
  } catch (error) {
    addLog(`Failed to save config: ${error.message}`, "error");
  }
}
async function makeApiCall(url, method, data, proxyUrl) {
  try {
    const headers = { ...Headers, 'user-agent': userAgents[Math.floor(Math.random() * userAgents.length)] };
    const agent = createAgent(proxyUrl);
    if (isDebug) {
      addLog(`Debug: Sending API request to ${url} with payload: ${JSON.stringify(data, null, 2)}`, "debug");
    }
    const response = await axios({ method, url, data, headers, httpsAgent: agent });
    if (isDebug) {
      addLog(`Debug: API response from ${url}: ${JSON.stringify(response.data, null, 2)}`, "debug");
    }
    return response.data;
  } catch (error) {
    addLog(`API call failed (${url}): ${error.message}`, "error");
    if (error.response) {
      addLog(`Debug: Error response: ${JSON.stringify(error.response.data, null, 2)}`, "debug");
    }
    throw error;
  }
}
process.on("unhandledRejection", (reason) => {
  addLog(`Unhandled Rejection: ${reason.message || reason}`, "error");
});
process.on("uncaughtException", (error) => {
  addLog(`Uncaught Exception: ${error.message}\n${error.stack}`, "error");
  process.exit(1);
});
function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}
function addLog(message, type = "info") {
  if (type === "debug" && !isDebug) return;
  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  let coloredMessage;
  switch (type) {
    case "error":
      coloredMessage = chalk.redBright(message);
      break;
    case "success":
      coloredMessage = chalk.greenBright(message);
      break;
    case "warn":
      coloredMessage = chalk.magentaBright(message);
      break;
    case "wait":
      coloredMessage = chalk.yellowBright(message);
      break;
    case "info":
      coloredMessage = chalk.whiteBright(message);
      break;
    case "delay":
      coloredMessage = chalk.cyanBright(message);
      break;
    case "debug":
      coloredMessage = chalk.blueBright(message);
      break;
    default:
      coloredMessage = chalk.white(message);
  }
  const logMessage = `[${timestamp}] ${coloredMessage}`;
  transactionLogs.push(logMessage);
  updateLogs();
}
function getShortHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-4);
}
function clearTransactionLogs() {
  transactionLogs = [];
  logBox.setContent('');
  logBox.scrollTo(0);
  addLog("Transaction logs cleared.", "success");
}
function loadAccounts() {
  try {
    const data = fs.readFileSync("pk.txt", "utf8");
    accounts = data.split("\n").map(line => line.trim()).filter(line => line).map(privateKey => ({ privateKey }));
    if (accounts.length === 0) {
      throw new Error("No private keys found in pk.txt");
    }
    addLog(`Loaded ${accounts.length} accounts from pk.txt`, "success");
  } catch (error) {
    addLog(`Failed to load accounts: ${error.message}`, "error");
    accounts = [];
  }
}
function loadProxies() {
  try {
    if (fs.existsSync("proxy.txt")) {
      const data = fs.readFileSync("proxy.txt", "utf8");
      proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
      if (proxies.length === 0) throw new Error("No proxy found in proxy.txt");
      addLog(`Loaded ${proxies.length} proxies from proxy.txt`, "success");
    } else {
      addLog("No proxy.txt found, running without proxy.", "info");
    }
  } catch (error) {
    addLog(`Failed to load proxy: ${error.message}`, "info");
    proxies = [];
  }
}
function createAgent(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyUrl.startsWith("socks")) {
    return new SocksProxyAgent(proxyUrl);
  } else {
    return new HttpsProxyAgent(proxyUrl);
  }
}
function getProvider(rpcUrl, chainId, proxyUrl, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const agent = createAgent(proxyUrl);
      const fetchOptions = agent ? { agent } : {};
      const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId, name: "Icarus" }, { fetchOptions });
      return provider;
    } catch (error) {
      addLog(`Attempt ${attempt}/${maxRetries} failed to initialize provider: ${error.message}`, "error");
      if (attempt < maxRetries) sleep(1000);
    }
  }
  throw new Error(`Failed to initialize provider for chain ${chainId}`);
}
async function sleep(ms) {
  if (shouldStop) {
    if (!hasLoggedSleepInterrupt) {
      addLog("Process stopped successfully.", "info");
      hasLoggedSleepInterrupt = true;
    }
    return;
  }
  activeProcesses++;
  try {
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, ms);
      const checkStop = setInterval(() => {
        if (shouldStop) {
          clearTimeout(timeout);
          clearInterval(checkStop);
          if (!hasLoggedSleepInterrupt) {
            addLog("Process interrupted.", "info");
            hasLoggedSleepInterrupt = true;
          }
          resolve();
        }
      }, 100);
    });
  } catch (error) {
    addLog(`Sleep error: ${error.message}`, "error");
  } finally {
    activeProcesses = Math.max(0, activeProcesses - 1);
  }
}
async function updateWalletData() {
  const walletDataPromises = accounts.map(async (account, i) => {
    try {
      const proxyUrl = proxies[i % proxies.length] || null;
      const icarusProvider = getProvider(ICARUS_RPC_URL, ICARUS_CHAIN_ID, proxyUrl);
      const wallet = new ethers.Wallet(account.privateKey, icarusProvider);
      const ethBalance = await icarusProvider.getBalance(wallet.address);
      const formattedETH = Number(ethers.formatEther(ethBalance)).toFixed(6);
      const riseContract = new ethers.Contract(RISE_ADDRESS, TOKEN_ABI, wallet);
      const riseBalance = await riseContract.balanceOf(wallet.address);
      const formattedRISE = Number(ethers.formatEther(riseBalance)).toFixed(6);
      const usdtContract = new ethers.Contract(USDT_ADDRESS, TOKEN_ABI, wallet);
      const usdtBalance = await usdtContract.balanceOf(wallet.address);
      const formattedUSDT = Number(ethers.formatUnits(usdtBalance, 6)).toFixed(6);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, TOKEN_ABI, wallet);
      const usdcBalance = await usdcContract.balanceOf(wallet.address);
      const formattedUSDC = Number(ethers.formatUnits(usdcBalance, 6)).toFixed(6);
      const formattedEntry = `${i === selectedWalletIndex ? "→ " : " "}${chalk.bold.magentaBright(getShortAddress(wallet.address))} ${chalk.bold.cyanBright(formattedETH.padEnd(12))} ${chalk.bold.yellowBright(formattedRISE.padEnd(12))} ${chalk.bold.greenBright(formattedUSDT.padEnd(12))} ${chalk.bold.blueBright(formattedUSDC.padEnd(12))}`;
      if (i === selectedWalletIndex) {
        walletInfo.address = wallet.address;
        walletInfo.activeAccount = `Account ${i + 1}`;
        walletInfo.balanceETH = formattedETH;
        walletInfo.balanceRISE = formattedRISE;
        walletInfo.balanceUSDT = formattedUSDT;
        walletInfo.balanceUSDC = formattedUSDC;
      }
      return formattedEntry;
    } catch (error) {
      addLog(`Failed to fetch wallet data for account #${i + 1}: ${error.message}`, "error");
      return `${i === selectedWalletIndex ? "→ " : " "}N/A 0.000000 0.000000 0.000000 0.000000`;
    }
  });
  try {
    const walletData = await Promise.all(walletDataPromises);
    addLog("Wallet data updated.", "success");
    return walletData;
  } catch (error) {
    addLog(`Wallet data update failed: ${error.message}`, "error");
    return [];
  }
}
async function getNextNonce(provider, walletAddress, chainId) {
  if (shouldStop) {
    addLog("Nonce fetch stopped due to stop request.", "info");
    throw new Error("Process stopped");
  }
  if (!ethers.isAddress(walletAddress)) {
    addLog(`Invalid wallet address: ${walletAddress}`, "error");
    throw new Error("Invalid wallet address");
  }
  const nonceKey = `${chainId}_${walletAddress}`;
  try {
    const pendingNonce = BigInt(await provider.getTransactionCount(walletAddress, "pending"));
    const lastUsedNonce = nonceTracker[nonceKey] || (pendingNonce - 1n);
    const nextNonce = pendingNonce > lastUsedNonce + 1n ? pendingNonce : lastUsedNonce + 1n;
    nonceTracker[nonceKey] = nextNonce;
    addLog(`Debug: Fetched nonce ${nextNonce} for ${getShortAddress(walletAddress)} on chain ${chainId}`, "debug");
    return nextNonce;
  } catch (error) {
    addLog(`Failed to fetch nonce for ${getShortAddress(walletAddress)} on chain ${chainId}: ${error.message}`, "error");
    throw error;
  }
}
async function getFeeParams(provider) {
  try {
    const feeData = await provider.getFeeData();
    let params = {};
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      params = {
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        type: 2
      };
    } else {
      params = {
        gasPrice: feeData.gasPrice || ethers.parseUnits("1", "gwei"),
        type: 0
      };
    }
    return params;
  } catch (error) {
    addLog(`Failed to get fee data: ${error.message}. Using default.`, "debug");
    return {
      gasPrice: ethers.parseUnits("1", "gwei"),
      type: 0
    };
  }
}
async function approveToken(wallet, tokenAddress, spender, amountWei, provider, decimals = 18) {
  const erc20Interface = new ethers.Interface(TOKEN_ABI);
  const allowanceData = erc20Interface.encodeFunctionData('allowance', [wallet.address, spender]);
  const allowanceCall = { to: tokenAddress, data: allowanceData };
  const allowance = BigInt(await provider.call(allowanceCall));
  if (allowance >= amountWei) {
    addLog(`Token ${tokenNames[tokenAddress] || getShortAddress(tokenAddress)} already approved for ${ethers.formatUnits(amountWei, decimals)}`, "info");
    return;
  }
  const approveData = erc20Interface.encodeFunctionData('approve', [spender, amountWei]);
  const feeParams = await getFeeParams(provider);
  const txParams = {
    to: tokenAddress,
    data: approveData,
    value: 0n,
    ...feeParams
  };
  const gasLimit = 100000n;
  addLog(`Using fixed gas limit for approve: ${gasLimit}`, "debug");
  const nonce = await getNextNonce(provider, wallet.address, ICARUS_CHAIN_ID);
  const tx = await wallet.sendTransaction({
    ...txParams,
    gasLimit,
    nonce
  });
  addLog(`Approve Transaction sent: ${getShortHash(tx.hash)}`, "warn");
  const receipt = await tx.wait();
  if (receipt.status === 0) {
    throw new Error("Approve transaction reverted");
  }
  addLog(`Token approved successfully, Hash: ${getShortHash(tx.hash)}`, "success");
}
async function getQuote(tokenFrom, tokenTo, amount, slippage = 0.5) {
  const url = `https://sugar-sdk-production.up.railway.app/quote?token_from=${tokenFrom}&token_to=${tokenTo}&amount=${amount}&slippage=${slippage}`;
  try {
    const response = await makeApiCall(url, 'get', null, null);
    return response;
  } catch (error) {
    addLog(`Failed to get quote: ${error.message}`, "error");
    throw error;
  }
}
async function performSwap(wallet, direction, fromToken, toToken, amount, decimalsFrom = 18, proxyUrl) {
  const { rpc, chainId } = direction;
  const provider = getProvider(rpc, chainId, proxyUrl);
  wallet = wallet.connect(provider);
  const address = wallet.address.toLowerCase();
  const amountWei = ethers.parseUnits(amount.toString(), decimalsFrom);
  let balance;
  if (fromToken === "ETH") {
    balance = await provider.getBalance(address);
  } else {
    const tokenContract = new ethers.Contract(fromToken, TOKEN_ABI, wallet);
    balance = await tokenContract.balanceOf(address);
  }
  if (balance < amountWei) {
    throw new Error(`Insufficient balance for ${tokenNames[fromToken]}: ${ethers.formatUnits(balance, decimalsFrom)} < ${amount}`);
  }
  const quote = await getQuote(fromToken, toToken, amountWei.toString());
  if (!quote || !quote.encoded_commands || !quote.pretty_encoded_inputs) {
    throw new Error("Invalid quote response");
  }
  if (fromToken !== "ETH") {
    await approveToken(wallet, fromToken, ROUTER_ADDRESS, amountWei, provider, decimalsFrom);
  }
  const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);
  const txData = routerContract.interface.encodeFunctionData('execute', [quote.encoded_commands, quote.pretty_encoded_inputs]);
  const feeParams = await getFeeParams(provider);
  const txParams = {
    to: ROUTER_ADDRESS,
    data: txData,
    value: fromToken === "ETH" ? amountWei : 0n,
    ...feeParams
  };
  const gasLimit = 650000n;
  addLog(`Using fixed gas limit: ${gasLimit} for swap on Icarus`, "debug");
  const gasFee = feeParams.gasPrice || feeParams.maxFeePerGas;
  const estimatedGasCost = gasFee * gasLimit;
  const ethBalance = await provider.getBalance(address);
  if (ethBalance < estimatedGasCost + (fromToken === "ETH" ? amountWei : 0n)) {
    throw new Error(`Insufficient ETH for gas + value: ${ethers.formatEther(ethBalance)} < ${ethers.formatEther(estimatedGasCost + (fromToken === "ETH" ? amountWei : 0n))}`);
  }
  let tx;
  try {
    const nonce = await getNextNonce(provider, address, chainId);
    tx = await wallet.sendTransaction({
      ...txParams,
      gasLimit,
      nonce
    });
    addLog(`Swap Transaction sent: ${getShortHash(tx.hash)}`, "warn");
  } catch (error) {
    addLog(`Transaction failed: ${error.message}`, "error");
    if (error.message.includes("nonce")) {
      const nonceKey = `${chainId}_${address}`;
      delete nonceTracker[nonceKey];
      addLog(`Nonce error detected, resetting nonce for next attempt.`, "warn");
    }
    throw error;
  }
  let receipt;
  const timeoutMs = 300000;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Transaction confirmation timed out")), timeoutMs);
    });
    receipt = await Promise.race([tx.wait(), timeoutPromise]);
    if (receipt.status === 0) {
      throw new Error("Transaction reverted");
    }
    addLog(`Swap ${amount} ${tokenNames[fromToken]} ➯ ${tokenNames[toToken]} Successfully, Hash: ${getShortHash(tx.hash)}`, "success");
  } catch (error) {
    addLog(`Transaction failed: ${error.message}`, "error");
    throw error;
  }
}
async function performAddLiquidity(wallet, direction, amountUSDT, proxyUrl) {
  const { rpc, chainId } = direction;
  const provider = getProvider(rpc, chainId, proxyUrl);
  wallet = wallet.connect(provider);
  const address = wallet.address.toLowerCase();
  const amountUSDTDesired = ethers.parseUnits(amountUSDT.toString(), 6);
  const amountUSDCDesired = ethers.parseUnits("1000", 6); 
  const liqRouter = new ethers.Contract(LIQ_ROUTER_ADDRESS, LIQ_ROUTER_ABI, wallet);
  const defaultFactory = await liqRouter.defaultFactory();
  const [amountA, amountB, liquidity] = await liqRouter.quoteAddLiquidity(
    USDT_ADDRESS,
    USDC_ADDRESS,
    true,
    defaultFactory,
    amountUSDTDesired,
    amountUSDCDesired
  );
  if (amountA === 0n || amountB === 0n) {
    throw new Error("Invalid liquidity amounts");
  }
  const slippage = 0.005; 
  const amountAMin = amountA * BigInt(1000 - Math.floor(slippage * 1000)) / 1000n;
  const amountBMin = amountB * BigInt(1000 - Math.floor(slippage * 1000)) / 1000n;
  await approveToken(wallet, USDT_ADDRESS, LIQ_ROUTER_ADDRESS, amountUSDTDesired, provider, 6);
  await approveToken(wallet, USDC_ADDRESS, LIQ_ROUTER_ADDRESS, amountUSDCDesired, provider, 6);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const feeParams = await getFeeParams(provider);
  const txParams = {
    to: LIQ_ROUTER_ADDRESS,
    data: liqRouter.interface.encodeFunctionData('addLiquidity', [
      USDT_ADDRESS,
      USDC_ADDRESS,
      true,
      amountUSDTDesired,
      amountUSDCDesired,
      amountAMin,
      amountBMin,
      address,
      deadline
    ]),
    value: 0n,
    ...feeParams
  };
  const gasLimit = 650000n;
  addLog(`Using fixed gas limit: ${gasLimit} for add liquidity on Icarus`, "debug");
  const gasFee = feeParams.gasPrice || feeParams.maxFeePerGas;
  const estimatedGasCost = gasFee * gasLimit;
  const ethBalance = await provider.getBalance(address);
  if (ethBalance < estimatedGasCost) {
    throw new Error(`Insufficient ETH for gas: ${ethers.formatEther(ethBalance)} < ${ethers.formatEther(estimatedGasCost)}`);
  }
  let tx;
  try {
    const nonce = await getNextNonce(provider, address, chainId);
    tx = await wallet.sendTransaction({
      ...txParams,
      gasLimit,
      nonce
    });
    addLog(`Add Liquidity Transaction sent: ${getShortHash(tx.hash)}`, "warn");
  } catch (error) {
    addLog(`Transaction failed: ${error.message}`, "error");
    if (error.message.includes("nonce")) {
      const nonceKey = `${chainId}_${address}`;
      delete nonceTracker[nonceKey];
      addLog(`Nonce error detected, resetting nonce for next attempt.`, "warn");
    }
    throw error;
  }
  let receipt;
  const timeoutMs = 300000;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Transaction confirmation timed out")), timeoutMs);
    });
    receipt = await Promise.race([tx.wait(), timeoutPromise]);
    if (receipt.status === 0) {
      throw new Error("Transaction reverted");
    }
    const formattedAmountUSDC = Number(ethers.formatUnits(amountB, 6)).toFixed(6);
    addLog(`Add Liquidity ${amountUSDT} USDT and ${formattedAmountUSDC} USDC Successfully, Hash: ${getShortHash(tx.hash)}`, "success");
  } catch (error) {
    addLog(`Transaction failed: ${error.message}`, "error");
    throw error;
  }
}
const swapDirections = [
  { from: RISE_ADDRESS, to: "ETH", range: "riseSwapRange", decimals: 18, label: "RISE ➯ ETH" },
  { from: "ETH", to: RISE_ADDRESS, range: "ethSwapRange", decimals: 18, label: "ETH ➯ RISE" },
  { from: RISE_ADDRESS, to: USDC_ADDRESS, range: "riseSwapRange", decimals: 18, label: "RISE ➯ USDC" },
  { from: USDC_ADDRESS, to: RISE_ADDRESS, range: "usdcSwapRange", decimals: 6, label: "USDC ➯ RISE" },
  { from: RISE_ADDRESS, to: USDT_ADDRESS, range: "riseSwapRange", decimals: 18, label: "RISE ➯ USDT" },
  { from: USDT_ADDRESS, to: RISE_ADDRESS, range: "usdtSwapRange", decimals: 6, label: "USDT ➯ RISE" }
];
async function runDailyActivity() {
  if (accounts.length === 0) {
    addLog("No valid accounts found.", "error");
    return;
  }
  addLog(`Starting daily activity for all accounts. Auto Swap: ${dailyActivityConfig.swapRepetitions}x, Auto Add Liq: ${dailyActivityConfig.addLiqRepetitions}x`, "info");
  activityRunning = true;
  isCycleRunning = true;
  shouldStop = false;
  hasLoggedSleepInterrupt = false;
  activeProcesses = Math.max(0, activeProcesses);
  updateMenu();
  try {
    for (let accountIndex = 0; accountIndex < accounts.length && !shouldStop; accountIndex++) {
      addLog(`Starting processing for account ${accountIndex + 1}`, "info");
      selectedWalletIndex = accountIndex;
      const proxyUrl = proxies[accountIndex % proxies.length] || null;
      addLog(`Account ${accountIndex + 1}: Using Proxy ${proxyUrl || "none"}`, "info");
      const wallet = new ethers.Wallet(accounts[accountIndex].privateKey);
      if (!ethers.isAddress(wallet.address)) {
        addLog(`Invalid wallet address for account ${accountIndex + 1}: ${wallet.address}`, "error");
        continue;
      }
      addLog(`Processing account ${accountIndex + 1}: ${getShortAddress(wallet.address)}`, "wait");
      const direction = directions[0];
      for (let swapCount = 0; swapCount < dailyActivityConfig.swapRepetitions && !shouldStop; swapCount++) {
        const randomSwap = swapDirections[Math.floor(Math.random() * swapDirections.length)];
        const min = dailyActivityConfig[randomSwap.range].min;
        const max = dailyActivityConfig[randomSwap.range].max;
        const decimalsFixed = randomSwap.decimals === 18 && randomSwap.from === "ETH" ? 6 : randomSwap.decimals === 18 ? 2 : 2;
        const amount = (Math.random() * (max - min) + min).toFixed(decimalsFixed);
        addLog(`Account ${accountIndex + 1} - Swap ${swapCount + 1}: ${randomSwap.label} with ${amount}`, "warn");
        try {
          await performSwap(wallet, direction, randomSwap.from, randomSwap.to, amount, randomSwap.decimals, proxyUrl);
        } catch (error) {
          addLog(`Account ${accountIndex + 1} - Swap ${swapCount + 1}: Failed: ${error.message}. Skipping to next.`, "error");
        } finally {
          await updateWallets();
        }
        if (swapCount < dailyActivityConfig.swapRepetitions - 1 && !shouldStop) {
          const randomDelay = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;
          addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before next swap...`, "delay");
          await sleep(randomDelay);
        }
      }
      if (dailyActivityConfig.addLiqRepetitions > 0 && !shouldStop) {
        addLog(`Account ${accountIndex + 1} - Waiting 10 seconds before starting add liquidity...`, "delay");
        await sleep(10000);
      }
      for (let addLiqCount = 0; addLiqCount < dailyActivityConfig.addLiqRepetitions && !shouldStop; addLiqCount++) {
        const min = dailyActivityConfig.usdtLiqRange.min;
        const max = dailyActivityConfig.usdtLiqRange.max;
        const amountUSDT = (Math.random() * (max - min) + min).toFixed(6);
        addLog(`Account ${accountIndex + 1} - Add Liquidity ${addLiqCount + 1}: ${amountUSDT} USDT for USDC`, "warn");
        try {
          await performAddLiquidity(wallet, direction, amountUSDT, proxyUrl);
        } catch (error) {
          addLog(`Account ${accountIndex + 1} - Add Liquidity ${addLiqCount + 1}: Failed: ${error.message}. Skipping to next.`, "error");
        } finally {
          await updateWallets();
        }
        if (addLiqCount < dailyActivityConfig.addLiqRepetitions - 1 && !shouldStop) {
          const randomDelay = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;
          addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before next add liquidity...`, "delay");
          await sleep(randomDelay);
        }
      }
      if (accountIndex < accounts.length - 1 && !shouldStop) {
        addLog(`Waiting 10 seconds before next account...`, "delay");
        await sleep(10000);
      }
    }
    if (!shouldStop && activeProcesses <= 0) {
      addLog(`All accounts processed. Waiting ${dailyActivityConfig.loopHours} hours for next cycle.`, "success");
      dailyActivityInterval = setTimeout(runDailyActivity, dailyActivityConfig.loopHours * 60 * 60 * 1000);
    }
  } catch (error) {
    addLog(`Daily activity failed: ${error.message}`, "error");
  } finally {
    if (shouldStop) {
      if (activeProcesses <= 0) {
        if (dailyActivityInterval) {
          clearTimeout(dailyActivityInterval);
          dailyActivityInterval = null;
          addLog("Cleared daily activity interval.", "info");
        }
        activityRunning = false;
        isCycleRunning = false;
        shouldStop = false;
        hasLoggedSleepInterrupt = false;
        activeProcesses = 0;
        addLog("Daily activity stopped successfully.", "success");
        updateMenu();
        updateStatus();
        safeRender();
      } else {
        const stopCheckInterval = setInterval(() => {
          if (activeProcesses <= 0) {
            clearInterval(stopCheckInterval);
            if (dailyActivityInterval) {
              clearTimeout(dailyActivityInterval);
              dailyActivityInterval = null;
              addLog("Cleared daily activity interval.", "info");
            }
            activityRunning = false;
            isCycleRunning = false;
            shouldStop = false;
            hasLoggedSleepInterrupt = false;
            activeProcesses = 0;
            addLog("Daily activity stopped successfully.", "success");
            updateMenu();
            updateStatus();
            safeRender();
          } else {
            addLog(`Waiting for ${activeProcesses} process to complete...`, "info");
            safeRender();
          }
        }, 1000);
      }
    } else {
      activityRunning = false;
      isCycleRunning = activeProcesses > 0 || dailyActivityInterval !== null;
      updateMenu();
      updateStatus();
      safeRender();
    }
    nonceTracker = {};
  }
}
const screen = blessed.screen({
  smartCSR: true,
  title: "ICARUS TESTNET AUTO BOT",
  autoPadding: true,
  fullUnicode: true,
  mouse: true,
  ignoreLocked: ["C-c", "q", "escape"]
});
const headerBox = blessed.box({
  top: 0,
  left: "center",
  width: "100%",
  height: 6,
  tags: true,
  style: { fg: "yellow", bg: "default" }
});
const statusBox = blessed.box({
  left: 0,
  top: 6,
  width: "100%",
  height: 3,
  tags: true,
  border: { type: "line", fg: "cyan" },
  style: { fg: "white", bg: "default", border: { fg: "cyan" } },
  content: "Status: Initializing...",
  padding: { left: 1, right: 1, top: 0, bottom: 0 },
  label: chalk.cyan(" Status "),
  wrap: true
});
const walletBox = blessed.list({
  label: " Wallet Information",
  top: 9,
  left: 0,
  width: "40%",
  height: "35%",
  border: { type: "line", fg: "cyan" },
  style: { border: { fg: "cyan" }, fg: "white", bg: "default", item: { fg: "white" } },
  scrollable: true,
  scrollbar: { bg: "cyan", fg: "black" },
  padding: { left: 1, right: 1, top: 0, bottom: 0 },
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  content: "Loading wallet data..."
});
const logBox = blessed.log({
  label: " Transaction Logs",
  top: 9,
  left: "41%",
  width: "59%",
  height: "100%-9",
  border: { type: "line" },
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  tags: true,
  scrollbar: { ch: "│", style: { bg: "cyan", fg: "white" }, track: { bg: "gray" } },
  scrollback: 100,
  smoothScroll: true,
  style: { border: { fg: "magenta" }, bg: "default", fg: "white" },
  padding: { left: 1, right: 1, top: 0, bottom: 0 },
  wrap: true,
  focusable: true,
  keys: true
});
const menuBox = blessed.list({
  label: " Menu ",
  top: "44%",
  left: 0,
  width: "40%",
  height: "56%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: { fg: "white", bg: "default", border: { fg: "red" }, selected: { bg: "magenta", fg: "black" }, item: { fg: "white" } },
  items: isCycleRunning
    ? ["Stop Activity", "Set Manual Config", "Clear Logs", "Refresh", "Exit"]
    : ["Start Auto Daily Activity", "Set Manual Config", "Clear Logs", "Refresh", "Exit"],
  padding: { left: 1, top: 1 }
});
const dailyActivitySubMenu = blessed.list({
  label: " Manual Config Options ",
  top: "44%",
  left: 0,
  width: "40%",
  height: "56%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "blue" },
    selected: { bg: "blue", fg: "black" },
    item: { fg: "white" }
  },
  items: [
    "Set Swap Repetitions",
    "Set Add Liq Repetitions",
    "Set RISE Swap Range",
    "Set ETH Swap Range",
    "Set USDT Swap Range",
    "Set USDC Swap Range",
    "Set USDT Liq Range",
    "Set Loop Daily",
    "Back to Main Menu"
  ],
  padding: { left: 1, top: 1 },
  hidden: true
});
const configForm = blessed.form({
  label: " Enter Config Value ",
  top: "center",
  left: "center",
  width: "30%",
  height: "40%",
  keys: true,
  mouse: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "blue" }
  },
  padding: { left: 1, top: 1 },
  hidden: true
});
const minLabel = blessed.text({
  parent: configForm,
  top: 0,
  left: 1,
  content: "Min Value:",
  style: { fg: "white" }
});
const maxLabel = blessed.text({
  parent: configForm,
  top: 4,
  left: 1,
  content: "Max Value:",
  style: { fg: "white" }
});
const configInput = blessed.textbox({
  parent: configForm,
  top: 1,
  left: 1,
  width: "90%",
  height: 3,
  inputOnFocus: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "white" },
    focus: { border: { fg: "green" } }
  }
});
const configInputMax = blessed.textbox({
  parent: configForm,
  top: 5,
  left: 1,
  width: "90%",
  height: 3,
  inputOnFocus: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "white" },
    focus: { border: { fg: "green" } }
  }
});
const configSubmitButton = blessed.button({
  parent: configForm,
  top: 9,
  left: "center",
  width: 10,
  height: 3,
  content: "Submit",
  align: "center",
  border: { type: "line" },
  clickable: true,
  keys: true,
  mouse: true,
  style: {
    fg: "white",
    bg: "blue",
    border: { fg: "white" },
    hover: { bg: "green" },
    focus: { bg: "green", border: { fg: "yellow" } }
  }
});
screen.append(headerBox);
screen.append(statusBox);
screen.append(walletBox);
screen.append(logBox);
screen.append(menuBox);
screen.append(dailyActivitySubMenu);
screen.append(configForm);
let renderQueue = [];
let isRendering = false;
function safeRender() {
  renderQueue.push(true);
  if (isRendering) return;
  isRendering = true;
  setTimeout(() => {
    try {
      if (!isHeaderRendered) {
        figlet.text("NT EXHAUST", { font: "ANSI Shadow" }, (err, data) => {
          if (!err) headerBox.setContent(`{center}{bold}{cyan-fg}${data}{/cyan-fg}{/bold}{/center}`);
          isHeaderRendered = true;
        });
      }
      screen.render();
    } catch (error) {
      addLog(`UI render error: ${error.message}`, "error");
    }
    renderQueue.shift();
    isRendering = false;
    if (renderQueue.length > 0) safeRender();
  }, 100);
}
function adjustLayout() {
  const screenHeight = screen.height || 24;
  const screenWidth = screen.width || 80;
  headerBox.height = Math.max(6, Math.floor(screenHeight * 0.15));
  statusBox.top = headerBox.height;
  statusBox.height = Math.max(3, Math.floor(screenHeight * 0.07));
  statusBox.width = screenWidth - 2;
  walletBox.top = headerBox.height + statusBox.height;
  walletBox.width = Math.floor(screenWidth * 0.4);
  walletBox.height = Math.floor(screenHeight * 0.35);
  logBox.top = headerBox.height + statusBox.height;
  logBox.left = Math.floor(screenWidth * 0.41);
  logBox.width = screenWidth - walletBox.width - 2;
  logBox.height = screenHeight - (headerBox.height + statusBox.height);
  menuBox.top = headerBox.height + statusBox.height + walletBox.height;
  menuBox.width = Math.floor(screenWidth * 0.4);
  menuBox.height = screenHeight - (headerBox.height + statusBox.height + walletBox.height);
  if (menuBox.top != null) {
    dailyActivitySubMenu.top = menuBox.top;
    dailyActivitySubMenu.width = menuBox.width;
    dailyActivitySubMenu.height = menuBox.height;
    dailyActivitySubMenu.left = menuBox.left;
    configForm.width = Math.floor(screenWidth * 0.3);
    configForm.height = Math.floor(screenHeight * 0.4);
  }
  safeRender();
}
function updateStatus() {
  try {
    const isProcessing = activityRunning || (isCycleRunning && dailyActivityInterval !== null);
    const status = activityRunning
      ? `${loadingSpinner[spinnerIndex]} ${chalk.yellowBright("Running")}`
      : isCycleRunning && dailyActivityInterval !== null
      ? `${loadingSpinner[spinnerIndex]} ${chalk.yellowBright("Waiting for next cycle")}`
      : chalk.green("Idle");
    const statusText = `Status: ${status} | Active Account: ${getShortAddress(walletInfo.address)} | Total Accounts: ${accounts.length} | Auto Swap: ${dailyActivityConfig.swapRepetitions}x | Auto Add Liq: ${dailyActivityConfig.addLiqRepetitions}x | Loop: ${dailyActivityConfig.loopHours}h | ICARUS TESTNET AUTO BOT`;
    statusBox.setContent(statusText);
    if (isProcessing) {
      if (blinkCounter % 1 === 0) {
        statusBox.style.border.fg = borderBlinkColors[borderBlinkIndex];
        borderBlinkIndex = (borderBlinkIndex + 1) % borderBlinkColors.length;
      }
      blinkCounter++;
    } else {
      statusBox.style.border.fg = "cyan";
    }
    spinnerIndex = (spinnerIndex + 1) % loadingSpinner.length;
    safeRender();
  } catch (error) {
    addLog(`Status update error: ${error.message}`, "error");
  }
}
async function updateWallets() {
  try {
    const walletData = await updateWalletData();
    const header = `${chalk.bold.cyan(" Address").padEnd(20)} ${chalk.bold.cyan("ETH".padEnd(12))} ${chalk.bold.yellow("RISE".padEnd(12))} ${chalk.bold.green("USDT".padEnd(12))} ${chalk.bold.blue("USDC".padEnd(12))}`;
    const separator = chalk.gray("-".repeat(80));
    walletBox.setItems([header, separator, ...walletData]);
    walletBox.select(0);
    safeRender();
  } catch (error) {
    addLog(`Failed to update wallet data: ${error.message}`, "error");
  }
}
function updateLogs() {
  try {
    logBox.add(transactionLogs[transactionLogs.length - 1] || chalk.gray("No logs available."));
    logBox.scrollTo(transactionLogs.length);
    safeRender();
  } catch (error) {
    addLog(`Log update failed: ${error.message}`, "error");
  }
}
function updateMenu() {
  try {
    menuBox.setItems(
      isCycleRunning
        ? ["Stop Activity", "Set Manual Config", "Clear Logs", "Refresh", "Exit"]
        : ["Start Auto Daily Activity", "Set Manual Config", "Clear Logs", "Refresh", "Exit"]
    );
    safeRender();
  } catch (error) {
    addLog(`Menu update failed: ${error.message}`, "error");
  }
}
const statusInterval = setInterval(updateStatus, 100);
logBox.key(["up"], () => {
  if (screen.focused === logBox) {
    logBox.scroll(-1);
    safeRender();
  }
});
logBox.key(["down"], () => {
  if (screen.focused === logBox) {
    logBox.scroll(1);
    safeRender();
  }
});
logBox.on("click", () => {
  screen.focusPush(logBox);
  logBox.style.border.fg = "yellow";
  menuBox.style.border.fg = "red";
  dailyActivitySubMenu.style.border.fg = "blue";
  safeRender();
});
logBox.on("blur", () => {
  logBox.style.border.fg = "magenta";
  safeRender();
});
menuBox.on("select", async (item) => {
  const action = item.getText();
  switch (action) {
    case "Start Auto Daily Activity":
      if (isCycleRunning) {
        addLog("Cycle is still running. Stop the current cycle first.", "error");
      } else {
        await runDailyActivity();
      }
      break;
    case "Stop Activity":
      shouldStop = true;
      if (dailyActivityInterval) {
        clearTimeout(dailyActivityInterval);
        dailyActivityInterval = null;
        addLog("Cleared daily activity interval.", "info");
      }
      addLog("Stopping daily activity. Please wait for ongoing process to complete.", "info");
      safeRender();
      if (activeProcesses <= 0) {
        activityRunning = false;
        isCycleRunning = false;
        shouldStop = false;
        hasLoggedSleepInterrupt = false;
        addLog("Daily activity stopped successfully.", "success");
        updateMenu();
        updateStatus();
        safeRender();
      } else {
        const stopCheckInterval = setInterval(() => {
          if (activeProcesses <= 0) {
            clearInterval(stopCheckInterval);
            activityRunning = false;
            isCycleRunning = false;
            shouldStop = false;
            hasLoggedSleepInterrupt = false;
            activeProcesses = 0;
            addLog("Daily activity stopped successfully.", "success");
            updateMenu();
            updateStatus();
            safeRender();
          } else {
            addLog(`Waiting for ${activeProcesses} process(es) to complete...`, "info");
            safeRender();
          }
        }, 1000);
      }
      break;
    case "Set Manual Config":
      menuBox.hide();
      dailyActivitySubMenu.show();
      setTimeout(() => {
        if (dailyActivitySubMenu.visible) {
          screen.focusPush(dailyActivitySubMenu);
          dailyActivitySubMenu.style.border.fg = "yellow";
          logBox.style.border.fg = "magenta";
          safeRender();
        }
      }, 100);
      break;
    case "Clear Logs":
      clearTransactionLogs();
      break;
    case "Refresh":
      await updateWallets();
      addLog("Data refreshed.", "success");
      break;
    case "Exit":
      clearInterval(statusInterval);
      process.exit(0);
  }
});
dailyActivitySubMenu.on("select", (item) => {
  const action = item.getText();
  switch (action) {
    case "Set Swap Repetitions":
      configForm.configType = "swapRepetitions";
      configForm.setLabel(" Enter Swap Repetitions ");
      minLabel.hide();
      maxLabel.hide();
      configInput.setValue(dailyActivityConfig.swapRepetitions.toString());
      configInputMax.setValue("");
      configInputMax.hide();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set Add Liq Repetitions":
      configForm.configType = "addLiqRepetitions";
      configForm.setLabel(" Enter Add Liq Repetitions ");
      minLabel.hide();
      maxLabel.hide();
      configInput.setValue(dailyActivityConfig.addLiqRepetitions.toString());
      configInputMax.setValue("");
      configInputMax.hide();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set RISE Swap Range":
      configForm.configType = "riseSwapRange";
      configForm.setLabel(" Enter RISE Swap Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.riseSwapRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.riseSwapRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set ETH Swap Range":
      configForm.configType = "ethSwapRange";
      configForm.setLabel(" Enter ETH Swap Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.ethSwapRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.ethSwapRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set USDT Swap Range":
      configForm.configType = "usdtSwapRange";
      configForm.setLabel(" Enter USDT Swap Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.usdtSwapRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.usdtSwapRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set USDC Swap Range":
      configForm.configType = "usdcSwapRange";
      configForm.setLabel(" Enter USDC Swap Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.usdcSwapRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.usdcSwapRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set USDT Liq Range":
      configForm.configType = "usdtLiqRange";
      configForm.setLabel(" Enter USDT Liq Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.usdtLiqRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.usdtLiqRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set Loop Daily":
      configForm.configType = "loopHours";
      configForm.setLabel(" Enter Loop Hours (Min 1 Hours) ");
      minLabel.hide();
      maxLabel.hide();
      configInput.setValue(dailyActivityConfig.loopHours.toString());
      configInputMax.setValue("");
      configInputMax.hide();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Back to Main Menu":
      dailyActivitySubMenu.hide();
      menuBox.show();
      setTimeout(() => {
        if (menuBox.visible) {
          screen.focusPush(menuBox);
          menuBox.style.border.fg = "cyan";
          dailyActivitySubMenu.style.border.fg = "blue";
          logBox.style.border.fg = "magenta";
          safeRender();
        }
      }, 100);
      break;
  }
});
let isSubmitting = false;
configForm.on("submit", () => {
  if (isSubmitting) return;
  isSubmitting = true;
  const inputValue = configInput.getValue().trim();
  let value, maxValue;
  try {
    if (configForm.configType === "loopHours" || configForm.configType === "swapRepetitions" || configForm.configType === "addLiqRepetitions") {
      value = parseInt(inputValue);
    } else {
      value = parseFloat(inputValue);
    }
    if (["riseSwapRange", "ethSwapRange", "usdtSwapRange", "usdcSwapRange", "usdtLiqRange"].includes(configForm.configType)) {
      maxValue = parseFloat(configInputMax.getValue().trim());
      if (isNaN(maxValue) || maxValue <= 0) {
        addLog("Invalid Max value. Please enter a positive number.", "error");
        configInputMax.clearValue();
        screen.focusPush(configInputMax);
        safeRender();
        isSubmitting = false;
        return;
      }
    }
    if (isNaN(value) || value <= 0) {
      addLog("Invalid input. Please enter a positive number.", "error");
      configInput.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    if (configForm.configType === "loopHours" && value < 1) {
      addLog("Invalid input. Minimum is 1 hour.", "error");
      configInput.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
  } catch (error) {
    addLog(`Invalid format: ${error.message}`, "error");
    configInput.clearValue();
    screen.focusPush(configInput);
    safeRender();
    isSubmitting = false;
    return;
  }
  if (configForm.configType === "swapRepetitions") {
    dailyActivityConfig.swapRepetitions = Math.floor(value);
    addLog(`Swap Repetitions set to ${dailyActivityConfig.swapRepetitions}`, "success");
  } else if (configForm.configType === "addLiqRepetitions") {
    dailyActivityConfig.addLiqRepetitions = Math.floor(value);
    addLog(`Add Liq Repetitions set to ${dailyActivityConfig.addLiqRepetitions}`, "success");
  } else if (configForm.configType === "riseSwapRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.riseSwapRange.min = value;
    dailyActivityConfig.riseSwapRange.max = maxValue;
    addLog(`RISE Swap Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "ethSwapRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.ethSwapRange.min = value;
    dailyActivityConfig.ethSwapRange.max = maxValue;
    addLog(`ETH Swap Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "usdtSwapRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.usdtSwapRange.min = value;
    dailyActivityConfig.usdtSwapRange.max = maxValue;
    addLog(`USDT Swap Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "usdcSwapRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.usdcSwapRange.min = value;
    dailyActivityConfig.usdcSwapRange.max = maxValue;
    addLog(`USDC Swap Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "usdtLiqRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.usdtLiqRange.min = value;
    dailyActivityConfig.usdtLiqRange.max = maxValue;
    addLog(`USDT Liq Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "loopHours") {
    dailyActivityConfig.loopHours = value;
    addLog(`Loop Daily set to ${value} hours`, "success");
  }
  saveConfig();
  updateStatus();
  configForm.hide();
  dailyActivitySubMenu.show();
  setTimeout(() => {
    if (dailyActivitySubMenu.visible) {
      screen.focusPush(dailyActivitySubMenu);
      dailyActivitySubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
    isSubmitting = false;
  }, 100);
});
configInput.key(["enter"], () => {
  if (["riseSwapRange", "ethSwapRange", "usdtSwapRange", "usdcSwapRange", "usdtLiqRange"].includes(configForm.configType)) {
    screen.focusPush(configInputMax);
  } else {
    configForm.submit();
  }
});
configInputMax.key(["enter"], () => {
  configForm.submit();
});
configSubmitButton.on("press", () => {
  configForm.submit();
});
configSubmitButton.on("click", () => {
  screen.focusPush(configSubmitButton);
  configForm.submit();
});
configForm.key(["escape"], () => {
  configForm.hide();
  dailyActivitySubMenu.show();
  setTimeout(() => {
    if (dailyActivitySubMenu.visible) {
      screen.focusPush(dailyActivitySubMenu);
      dailyActivitySubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});
dailyActivitySubMenu.key(["escape"], () => {
  dailyActivitySubMenu.hide();
  menuBox.show();
  setTimeout(() => {
    if (menuBox.visible) {
      screen.focusPush(menuBox);
      menuBox.style.border.fg = "cyan";
      dailyActivitySubMenu.style.border.fg = "blue";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});
screen.key(["escape", "q", "C-c"], () => {
  addLog("Exiting application", "info");
  clearInterval(statusInterval);
  process.exit(0);
});
async function initialize() {
  try {
    loadConfig();
    loadAccounts();
    loadProxies();
    updateStatus();
    await updateWallets();
    updateLogs();
    safeRender();
    menuBox.focus();
  } catch (error) {
    addLog(`Initialization error: ${error.message}`, "error");
  }
}
setTimeout(() => {
  adjustLayout();
  screen.on("resize", adjustLayout);
}, 100);
initialize();