// --- Constants --- const FREE_BASER_ADDRESS = "0x3bA341ea464ae63372Bfe60B572E677CE0d9a3Ba"; const DISPENSER_ADDRESS = "0xB709FafF4f731bfD767354738cB8A38D08a92920"; const PENG_NFT_ADDRESS = "0xB1a58fae5C0E952F64f9433789a350b8ab54D6D0"; const WPOL_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"; const LUSD_ADDRESS = "0xF0FD398Ca09444F771eC968d9cbF073a744A544c"; const POLYGON_CHAIN_ID = 137; const POLYGON_RPCS = [ "https://polygon-rpc.com", "https://rpc-mainnet.matic.network", "https://matic-mainnet.chainstacklabs.com", "https://rpc-mainnet.maticvigil.com", "https://polygon-mainnet.g.alchemy.com/v2/demo" ]; const POLYGON_NETWORK_CONFIG = { chainId: `0x${POLYGON_CHAIN_ID.toString(16)}`, chainName: "Polygon PoS", nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, rpcUrls: POLYGON_RPCS, blockExplorerUrls: ["https://polygonscan.com"] }; // --- ABIs --- const FREE_BASER_ABI = [ { inputs: [], name: "freebase", outputs: [], stateMutability: "nonpayable", type: "function" } ]; const DISPENSER_ABI = [ { inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }], name: "convert", outputs: [], stateMutability: "nonpayable", type: "function" } ]; const PENG_NFT_ABI = [ { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" } ]; const WPOL_ABI = [ { inputs: [{ internalType: "address", name: "guy", type: "address" }, { internalType: "uint256", name: "wad", type: "uint256" }], name: "approve", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" }, { inputs: [{ internalType: "address", name: "", type: "address" }, { internalType: "address", name: "", type: "address" }], name: "allowance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" } ]; const LUSD_ABI = [ { inputs: [], name: "getPrice", outputs: [{ internalType: "int256", name: "", type: "int256" }], stateMutability: "view", type: "function" } ]; // --- Utility Functions --- const debounce = (func, wait) => { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); }; }; // --- Classes --- class Web3App { constructor() { if (!Web3App.checkDependencies()) { console.warn("Dependencies missing; running in limited mode"); } const savedState = loadState(); this.appStore = { isConnected: savedState.isConnected || false, account: savedState.account || null, truncatedAccount: savedState.account ? `${savedState.account.slice(0, 6)}...${savedState.account.slice(-4)}` : null, isPolygon: savedState.isPolygon || false, pengBalance: savedState.pengBalance || 0, dispenseAmount: savedState.dispenseAmount || "1.0", wpolCost: savedState.wpolCost || "0 WPOL", needsApproval: savedState.needsApproval || false, showWalletModal: false, showQrModal: false, showDispenserModal: false, showDisconnectModal: false, isDarkMode: savedState.isDarkMode !== undefined ? savedState.isDarkMode : window.matchMedia('(prefers-color-scheme: dark)').matches, wcUri: null }; document.body.classList.toggle("dark-mode", this.appStore.isDarkMode); this.providerManager = new ProviderManager(this); this.contractManager = new ContractManager(this); } static checkDependencies() { return window.ethers && window.WalletConnectProvider && window.QRCode; } init() { console.log("Initializing Web3App..."); try { if (this.appStore.isConnected && this.appStore.account) { this.providerManager.reconnect(this.appStore.account); this.contractManager.refreshState(); } this.updateWpolCost(); } catch (e) { console.warn("Web3 features unavailable in local file mode:", e); this.appStore.wpolCost = "Web3 unavailable (local file)"; } } showDisconnectModal() { console.log("Disconnect modal clicked"); this.appStore.showDisconnectModal = true; } async connectBrowserWallet() { console.log("Browser wallet clicked"); await this.providerManager.connect("browser"); this.appStore.showWalletModal = false; } async connectQRCode() { console.log("QR code clicked"); await this.providerManager.connect("qr"); this.appStore.showQrModal = false; } async copyUri() { console.log("Copy URI clicked"); if (this.appStore.wcUri) { try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(this.appStore.wcUri); console.log("URI copied:", this.appStore.wcUri); alert("URI copied to clipboard"); } else { const textarea = document.createElement("textarea"); textarea.value = this.appStore.wcUri; document.body.appendChild(textarea); textarea.select(); document.execCommand("copy"); document.body.removeChild(textarea); console.log("URI copied (fallback):", this.appStore.wcUri); alert("URI copied to clipboard (fallback)"); } } catch (e) { console.error("Clipboard copy failed:", e); alert("Failed to copy URI"); } } else { alert("No URI available"); } } async handleNetworkSelection() { console.log("Network selection clicked"); if (!this.appStore.isConnected) { this.appStore.showWalletModal = true; return; } await this.providerManager.switchToPolygon(); } async disconnectWallet() { console.log("Disconnect wallet clicked"); this.providerManager.disconnect(); this.appStore.isConnected = false; this.appStore.account = null; this.appStore.truncatedAccount = null; this.appStore.isPolygon = false; this.appStore.pengBalance = 0; this.appStore.wcUri = null; saveState(this.appStore); } toggleDarkMode() { console.log("Toggle dark mode clicked"); this.appStore.isDarkMode = !this.appStore.isDarkMode; document.body.classList.toggle("dark-mode", this.appStore.isDarkMode); saveState(this.appStore); } /** * Updates the WPOL cost display based on the LUSD amount input. * Fetches the price from the LUSD contract, where price is the WPOL-to-LUSD ratio * with 8 decimals (e.g., 0.27 is returned as 27000000, meaning 1 LUSD = 1 / 0.27 = 3.7037 WPOL). * LUSD and WPOL both use 18 decimals, requiring normalization of the price from 8 to 18 decimals. * Updates `wpolCost` for UI display and checks WPOL allowance if a signer is present. */ async updateWpolCost() { console.log("Update WPOL cost clicked"); try { if (!/^\d*\.?\d*$/.test(this.appStore.dispenseAmount)) { this.appStore.wpolCost = "Invalid input"; return; } await this.contractManager.calculateWpolCost(this.appStore.dispenseAmount); saveState(this.appStore); } catch (e) { console.error("Error calculating WPOL cost:", e); this.appStore.wpolCost = "Price fetch failed"; this.appStore.needsApproval = false; } } executeDispenseOrApprove = debounce(async () => { console.log("Dispense/Approve clicked"); if (!this.providerManager.signer || !this.appStore.isPolygon) { alert("Connect wallet to Polygon first"); return; } try { const lusdAmount = ethers.utils.parseUnits(this.appStore.dispenseAmount, 18); if (this.appStore.needsApproval) { await this.contractManager.approveWpol(); this.updateWpolCost(); } else { await this.contractManager.convertLusd(lusdAmount); this.appStore.dispenseAmount = "1.0"; this.appStore.showDispenserModal = false; saveState(this.appStore); } } catch (e) { console.error("Dispense/Approve failed:", e); alert(`Action failed: ${e.message}`); } }, 300); executeFreebase = debounce(async () => { console.log("Freebase clicked"); if (!this.providerManager.signer || !this.appStore.isPolygon) { alert("Connect wallet to Polygon first"); return; } try { await this.contractManager.freebase(); console.log("Freebase executed"); } catch (e) { console.error("Freebase failed:", e); alert(`Freebase failed: ${e.message}`); } }, 300); } class ProviderManager { constructor(app) { this.app = app; this.provider = null; this.signer = null; this.wcHandler = new WalletConnectHandler(this.app); this.fallbackProvider = new ethers.providers.JsonRpcProvider(POLYGON_RPCS[0]); } async connect(type) { let account; if (type === "browser") { if (!window.ethereum) throw new Error("No wallet detected"); this.provider = window.ethereum; const accounts = await this.provider.request({ method: "eth_requestAccounts" }); account = accounts[0]; } else { account = await this.wcHandler.connect(); this.provider = this.wcHandler.wcProvider; } const web3Provider = new ethers.providers.Web3Provider(this.provider, "any"); this.signer = web3Provider.getSigner(); this.app.appStore.account = account; this.app.appStore.truncatedAccount = `${account.slice(0, 6)}...${account.slice(-4)}`; this.app.appStore.isConnected = true; this.app.appStore.isPolygon = (await web3Provider.getNetwork()).chainId === POLYGON_CHAIN_ID; await this.app.contractManager.refreshState(); saveState(this.app.appStore); } async reconnect(account) { this.provider = window.ethereum || this.wcHandler.wcProvider; if (this.provider) { const web3Provider = new ethers.providers.Web3Provider(this.provider, "any"); this.signer = web3Provider.getSigner(); this.app.appStore.account = account; this.app.appStore.truncatedAccount = `${account.slice(0, 6)}...${account.slice(-4)}`; this.app.appStore.isConnected = true; this.app.appStore.isPolygon = (await web3Provider.getNetwork()).chainId === POLYGON_CHAIN_ID; } } async switchToPolygon() { try { const web3Provider = new ethers.providers.Web3Provider(this.provider, "any"); const chainId = (await web3Provider.getNetwork()).chainId; if (chainId !== POLYGON_CHAIN_ID) { try { await this.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLYGON_NETWORK_CONFIG.chainId }] }); } catch (switchError) { if (switchError.code === 4902) { await this.provider.request({ method: "wallet_addEthereumChain", params: [POLYGON_NETWORK_CONFIG] }); await this.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLYGON_NETWORK_CONFIG.chainId }] }); } else { throw switchError; } } } this.app.appStore.isPolygon = (await web3Provider.getNetwork()).chainId === POLYGON_CHAIN_ID; saveState(this.app.appStore); } catch (e) { console.error("Network switch failed:", e); alert(`Network switch failed: ${e.message}`); } } disconnect() { if (this.wcHandler.wcProvider?.disconnect) this.wcHandler.wcProvider.disconnect(); this.provider = null; this.signer = null; } } class WalletConnectHandler { constructor(app) { this.app = app; this.wcProvider = null; } async connect() { this.wcProvider = new window.WalletConnectProvider({ rpc: { 137: POLYGON_RPCS[0] } }); const accounts = await this.wcProvider.enable(); this.app.appStore.wcUri = this.wcProvider.uri; this.renderQR(); return accounts[0]; } renderQR() { window.QRCode.toCanvas(document.getElementById("qrCanvas"), this.app.appStore.wcUri, { width: 200 }, (err) => { if (err) console.error("QR render failed:", err); }); } } class ContractManager { constructor(app) { this.app = app; this.contracts = {}; } async refreshState() { if (this.app.providerManager.signer) { this.contracts.peng = new ethers.Contract(PENG_NFT_ADDRESS, PENG_NFT_ABI, this.app.providerManager.signer); this.contracts.wpol = new ethers.Contract(WPOLunless: true this.contracts.lusd = new ethers.Contract(LUSD_ADDRESS, LUSD_ABI, this.app.providerManager.signer); this.contracts.dispenser = new ethers.Contract(DISPENSER_ADDRESS, DISPENSER_ABI, this.app.providerManager.signer); this.contracts.freebase = new ethers.Contract(FREE_BASER_ADDRESS, FREE_BASER_ABI, this.app.providerManager.signer); this.app.appStore.pengBalance = (await this.contracts.peng.balanceOf(this.app.appStore.account)).toNumber(); } } async calculateWpolCost(dispenseAmount) { const lusdAmount = ethers.utils.parseUnits(dispenseAmount || "0", 18); const priceNormalizationFactor = ethers.BigNumber.from(10).pow(10); // 8 to 18 decimals const provider = this.app.providerManager.signer || this.app.providerManager.fallbackProvider; const lusdContract = new ethers.Contract(LUSD_ADDRESS, LUSD_ABI, provider); const price = await lusdContract.getPrice(); console.log("Fetched price:", price.toString()); const wpolAmount = lusdAmount.mul(priceNormalizationFactor).div(price); this.app.appStore.wpolCost = `${ethers.utils.formatUnits(wpolAmount, 18)} WPOL`; if (this.app.providerManager.signer) { const allowance = await this.contracts.wpol.allowance(this.app.appStore.account, DISPENSER_ADDRESS); this.app.appStore.needsApproval = wpolAmount.gt(allowance); } else { this.app.appStore.needsApproval = false; } } async approveWpol() { const lusdAmount = ethers.utils.parseUnits(this.app.appStore.dispenseAmount, 18); const priceNormalizationFactor = ethers.BigNumber.from(10).pow(10); const price = await this.contracts.lusd.getPrice(); const wpolAmount = lusdAmount.mul(priceNormalizationFactor).div(price); const tx = await this.contracts.wpol.approve(DISPENSER_ADDRESS, wpolAmount); await tx.wait(); } async convertLusd(amount) { const tx = await this.contracts.dispenser.convert(amount); await tx.wait(); } async freebase() { const tx = await this.contracts.freebase.freebase(); await tx.wait(); } } // --- State Persistence --- const saveState = (state) => { const persistable = { ...state }; delete persistable.wcUri; // Avoid persisting transient URI localStorage.setItem("appState", JSON.stringify(persistable)); }; const loadState = () => JSON.parse(localStorage.getItem("appState") || "{}"); // --- Alpine Integration --- window.addEventListener("load", () => { const app = new Web3App(); document.addEventListener("alpine:init", () => { Alpine.data("appState", () => app.appStore); }); app.init(); }); // Version: 1.2.0