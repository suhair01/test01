<script>
// Configuration
const routerAddress = "0x06d8b6810edf37fc303f32f30ac149220c665c27";
const arenaRouterAddress = "0xF56D524D651B90E4B84dc2FffD83079698b9066E";
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

// Contract ABIs
const ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)",
  "function swapExactAVAXForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable",
  "function swapExactTokensForAVAXSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// App State
let provider, signer, router, arenaRouter, userAddress;
const tokenDecimals = {};
let walletType = null;

// Token List
const tokens = [
  { symbol: "AVAX", address: "AVAX", logo: "avaxlogo.png" },
  { symbol: "ARENA", address: "0xb8d7710f7d8349a506b75dd184f05777c82dad0c", logo: "arenalogo.png" },
  { symbol: "LAMBO", address: "0x6F43fF77A9C0Cf552b5b653268fBFe26A052429b", logo: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png" },
  { symbol: "WETH", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png" },
  { symbol: "JOE", address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanche/assets/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png" }
];

// Wallet Connection
async function connectWallet() {
  try {
    closeModal();
    walletType = 'metamask';

    if (!window.ethereum) throw new Error("MetaMask not installed");
    provider = new ethers.BrowserProvider(window.ethereum);
    await window.ethereum.request({ method: "eth_requestAccounts" });
    
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    signer = await provider.getSigner();
    router = new ethers.Contract(routerAddress, ABI, signer);
    arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);
    userAddress = await signer.getAddress();
    
    updateWalletUI();
    showToast('MetaMask connected!', "success");
    document.getElementById("swapBtn").disabled = false;
    updateBalances();
    updateEstimate();
    
  } catch (err) {
    console.error("Wallet connection error:", err);
    showToast(`Connection failed: ${err.message}`, "error");
    disconnectWallet();
  }
}

function disconnectWallet(e) {
  if (e) e.stopPropagation();
  
  if (window.ethereum) {
    window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    window.ethereum.removeListener('chainChanged', handleChainChanged);
  }
  
  provider = null;
  signer = null;
  userAddress = null;
  walletType = null;
  
  document.querySelector(".connect-btn").innerHTML = "Connect Wallet";
  document.getElementById("swapBtn").disabled = true;
  
  showToast("Wallet disconnected", "info");
}

// Balance Functions
async function getTokenBalance(token, address) {
  if (token.address === "AVAX") {
    const balance = await provider.getBalance(address);
    return parseFloat(ethers.formatEther(balance)).toFixed(4);
  }
  
  const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
  const bal = await contract.balanceOf(address);
  const dec = tokenDecimals[token.address] || 18;
  return parseFloat(ethers.formatUnits(bal, dec)).toFixed(4);
}

async function updateBalances() {
  if (!userAddress || !provider) return;
  
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);

  document.getElementById("balanceIn").innerText = "Balance: " + await getTokenBalance(tokenIn, userAddress);
  document.getElementById("balanceOut").innerText = "Balance: " + await getTokenBalance(tokenOut, userAddress);
}

// Initialize Token Decimals
async function initTokenDecimals() {
  const tempProvider = new ethers.BrowserProvider(window.ethereum || "https://api.avax.network/ext/bc/C/rpc");
  
  for (const t of tokens) {
    if (t.address === "AVAX") {
      tokenDecimals[t.address] = 18;
    } else {
      const contract = new ethers.Contract(t.address, ERC20_ABI, tempProvider);
      tokenDecimals[t.address] = await contract.decimals();
    }
  }
}

// Initialize App
window.addEventListener("DOMContentLoaded", async () => {
  await initTokenDecimals();
  
  if (window.ethereum?.selectedAddress) {
    await connectWallet();
  }
});
</script>
