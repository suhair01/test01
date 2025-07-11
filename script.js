const routerAddress = "0x06d8b6810edf37fc303f32f30ac149220c665c27";
const arenaRouterAddress = "0xF56D524D651B90E4B84dc2FffD83079698b9066E";
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

// WalletConnect Configuration
const WALLETCONNECT_PROJECT_ID = "02f48f8eb3b84b2e273baacb2b74a48f";
const WALLETCONNECT_CHAIN_ID = 43114; // Avalanche Mainnet

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

let provider, signer, router, arenaRouter, userAddress, walletConnectProvider;
const tokenDecimals = {};

const tokens = [
  { symbol: "AVAX", address: "AVAX", logo: "avaxlogo.png" },
  { symbol: "ARENA", address: "0xb8d7710f7d8349a506b75dd184f05777c82dad0c", logo: "arenalogo.png" },
  { symbol: "LAMBO", address: "0x6F43fF77A9C0Cf552b5b653268fBFe26A052429b", logo: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png" },
  { symbol: "WETH", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png" },
  { symbol: "JOE", address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanche/assets/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png" }
];

/* Wallet Connection Functions */
async function initializeWalletConnect() {
  walletConnectProvider = new WalletConnectProvider({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [WALLETCONNECT_CHAIN_ID],
    showQrModal: true,
    qrModalOptions: {
      themeVariables: {
        '--wcm-z-index': '9999',
        '--wcm-accent-color': '#ff0000',
        '--wcm-background-color': '#ff0000'
      }
    }
  });

  await walletConnectProvider.enable();
  return walletConnectProvider;
}

function setupWalletConnectEvents() {
  walletConnectProvider.on("accountsChanged", (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      handleAccountsChanged(accounts);
    }
  });

  walletConnectProvider.on("chainChanged", (chainId) => {
    handleChainChanged(chainId);
  });

  walletConnectProvider.on("disconnect", (code, reason) => {
    console.log("WalletConnect disconnected:", code, reason);
    disconnectWallet();
  });
}

function openModal() {
  document.getElementById('walletModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('walletModal').style.display = 'none';
}

async function connectWallet(walletType) {
  closeModal();
  
  try {
    if (walletType === 'metamask') {
      if (!window.ethereum) {
        showToast("Please install MetaMask!", "error");
        return;
      }
      provider = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      
      // Setup MetaMask event listeners
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    } 
    else if (walletType === 'walletconnect') {
      const wcProvider = await initializeWalletConnect();
      provider = new ethers.BrowserProvider(wcProvider);
      setupWalletConnectEvents();
    }
    else {
      throw new Error("Unsupported wallet type");
    }

    signer = await provider.getSigner();
    router = new ethers.Contract(routerAddress, ABI, signer);
    arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);
    userAddress = await signer.getAddress();
    
    updateWalletUI(walletType);
    showToast("Wallet connected!", "success");
    document.getElementById("swapBtn").disabled = false;
    updateBalances();
    updateEstimate();
    
  } catch (err) {
    console.error("Wallet connection error:", err);
    showToast(`Connection failed: ${err.message}`, "error");
    disconnectWallet();
  }
}

function updateWalletUI(walletType) {
  const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
  const walletIcon = walletType === 'metamask' ? 
    '<img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" width="16" height="16">' :
    '<img src="https://altcoinsbox.com/wp-content/uploads/2023/03/wallet-connect-logo.png" width="16" height="16">';
  
  document.querySelector(".connect-btn").innerHTML = `
    ${walletIcon}
    <span class="wallet-address">${shortAddress}</span>
    <span class="copy-icon" onclick="copyAddress(event)">📋</span>
    <span class="disconnect-icon" onclick="disconnectWallet(event)">✕</span>
  `;
}

function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    showToast("Wallet disconnected", "info");
    disconnectWallet();
  } else if (accounts[0] !== userAddress) {
    userAddress = accounts[0];
    updateWalletUI();
    updateBalances();
    updateEstimate();
    showToast("Account changed", "info");
  }
}

function handleChainChanged(chainId) {
  showToast("Network changed, please refresh page", "info");
  setTimeout(() => window.location.reload(), 1000);
}

function disconnectWallet(e) {
  if (e) e.stopPropagation();
  
  // Disconnect WalletConnect if active
  if (walletConnectProvider) {
    walletConnectProvider.disconnect();
    walletConnectProvider = null;
  }
  
  // Remove MetaMask listeners
  if (window.ethereum) {
    window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    window.ethereum.removeListener('chainChanged', handleChainChanged);
  }
  
  // Reset state
  provider = null;
  signer = null;
  userAddress = null;
  
  // Update UI
  document.querySelector(".connect-btn").innerHTML = "Connect Wallet";
  document.getElementById("swapBtn").disabled = true;
  
  showToast("Wallet disconnected", "info");
}

/* Token Functions */
async function populateTokens() {
  // Initialize with fallback provider if no wallet connected
  provider = provider || new ethers.BrowserProvider(window.ethereum || "https://api.avax.network/ext/bc/C/rpc");
  router = new ethers.Contract(routerAddress, ABI, provider);
  arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);
  
  const inSel = document.getElementById("tokenInSelect");
  const outSel = document.getElementById("tokenOutSelect");
  inSel.innerHTML = ""; outSel.innerHTML = "";

  for (const t of tokens) {
    const opt = document.createElement("option");
    opt.value = JSON.stringify(t);
    opt.innerText = t.symbol;
    inSel.appendChild(opt.cloneNode(true));
    outSel.appendChild(opt.cloneNode(true));

    if (t.address !== "AVAX") {
      const contract = new ethers.Contract(t.address, ERC20_ABI, provider);
      tokenDecimals[t.address] = await contract.decimals();
    } else {
      tokenDecimals[t.address] = 18;
    }
  }

  inSel.selectedIndex = 0;
  outSel.selectedIndex = 1;
  updateLogos();
}

// ... (rest of your existing token, swap, and UI functions remain the same) ...

/* Initialize the application */
window.addEventListener("DOMContentLoaded", () => {
  populateTokens();
  
  // Check for cached WalletConnect session
  if (localStorage.getItem('walletconnect')) {
    connectWallet('walletconnect').catch(console.error);
  }
  // Or check for existing MetaMask connection
  else if (window.ethereum?.selectedAddress) {
    connectWallet('metamask').catch(console.error);
  }
});

// Make functions available globally
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.openModal = openModal;
window.closeModal = closeModal;
// ... (other global functions) ...
