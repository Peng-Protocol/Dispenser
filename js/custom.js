// custom.js

// --- Constants ---
const FREE_BASER_ADDRESS = "0x3bA341ea464ae63372Bfe60B572E677CE0d9a3Ba";
const DISPENSER_ADDRESS = "0xB709FafF4f731bfD767354738cB8A38D08a92920";
const PENG_NFT_ADDRESS = "0xB1a58fae5C0E952F64f9433789a350b8ab54D6D0";
const WPOL_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const LUSD_ADDRESS = "0xF0FD398Ca09444F771eC968d9cbF073a744A544c";
const POLYGON_CHAIN_ID = 137;
const POLYGON_RPCS = [
    "https://polygon-rpc.com",
    "https://rpc-mainnet.matic.network",
    "https://matic-mainnet.chainstacklabs.com",
    "https://rpc-mainnet.maticvigil.com",
    "https://polygon-mainnet.g.alchemy.com/v2/demo" // Fallback public RPC
];
const POLYGON_NETWORK_CONFIG = {
    chainId: `0x${POLYGON_CHAIN_ID.toString(16)}`,
    chainName: "Polygon PoS",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: POLYGON_RPCS,
    blockExplorerUrls: ["https://polygonscan.com"]
};

// --- ABIs ---
const FREE_BASER_ABI = [
    { inputs: [], name: "freebase", outputs: [], stateMutability: "nonpayable", type: "function" }
];
const DISPENSER_ABI = [
    { inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }], name: "convert", outputs: [], stateMutability: "nonpayable", type: "function" }
];
const PENG_NFT_ABI = [
    { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
];
const WPOL_ABI = [
    { inputs: [{ internalType: "address", name: "guy", type: "address" }, { internalType: "uint256", name: "wad", type: "uint256" }], name: "approve", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ internalType: "address", name: "", type: "address" }, { internalType: "address", name: "", type: "address" }], name: "allowance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
];
const LUSD_ABI = [
    { inputs: [], name: "getPrice", outputs: [{ internalType: "int256", name: "", type: "int256" }], stateMutability: "view", type: "function" }
];

// --- Utility Functions ---
const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

// --- Alpine.js State ---
function appState() {
    const state = loadState();
    const fallbackProvider = new ethers.providers.JsonRpcProvider(POLYGON_RPCS[0]); // Fallback for cost display
    return {
        isConnected: state.isConnected || false,
        account: state.account || null,
        truncatedAccount: state.account ? `${state.account.slice(0, 6)}...${state.account.slice(-4)}` : null,
        isPolygon: state.isPolygon || false,
        pengBalance: state.pengBalance || 0,
        dispenseAmount: state.dispenseAmount || "1.0",
        wpolCost: state.wpolCost || "0 WPOL",
        needsApproval: state.needsApproval || false,
        showDisconnectModal: false,
        isDarkMode: state.isDarkMode || window.matchMedia('(prefers-color-scheme: dark)').matches,
        provider: null,
        signer: null,
        wcUri: null, // Store WalletConnect URI

        init() {
            console.log("Initializing app state...");
            document.body.classList.toggle("dark-mode", this.isDarkMode);
            if (this.isConnected && this.account) this.initializeProvider();
            this.updateWpolCost(); // Initial cost display
        },

        showDisconnectModal() {
            console.log("Showing disconnect modal");
            this.showDisconnectModal = true;
        },

        async connectBrowserWallet() {
            try {
                console.log("Connecting to browser wallet...");
                if (!window.ethereum) throw new Error("No wallet detected");
                this.provider = window.ethereum;
                const accounts = await this.provider.request({ method: 'eth_requestAccounts' });
                await this.initializeProvider(accounts[0]);
                document.getElementById('walletModal').classList.remove('show');
            } catch (e) {
                console.error("Connection failed:", e);
                alert(`Connection failed: ${e.message}`);
            }
        },

        async connectQRCode() {
            try {
                console.log("Starting WalletConnect...");
                if (!window.WalletConnectProvider) throw new Error("WalletConnectProvider not loaded");
                const wcProvider = new window.WalletConnectProvider({ rpc: { 137: POLYGON_RPCS[0] } });
                const uri = await wcProvider.enable();
                this.wcUri = uri; // Store URI for copy
                console.log("WC URI:", uri);
                QRCode.toCanvas(document.getElementById('qrCanvas'), uri, { width: 200 }, (error) => {
                    if (error) console.error("QR Error:", error);
                    else console.log("QR rendered successfully");
                });
                this.provider = wcProvider;
                await this.initializeProvider(wcProvider.accounts[0]);
                document.getElementById('qrModal').classList.remove('show');
            } catch (e) {
                console.error("QR code connection failed:", e);
                alert(`Connection failed: ${e.message}`);
            }
        },

        async copyUri() {
            if (this.wcUri) {
                try {
                    await navigator.clipboard.writeText(this.wcUri);
                    console.log("URI copied to clipboard:", this.wcUri);
                    alert("URI copied to clipboard");
                } catch (e) {
                    console.error("Clipboard copy failed:", e);
                    alert("Failed to copy URI");
                }
            } else {
                console.log("No URI available to copy");
                alert("No URI available");
            }
        },

        async initializeProvider(account) {
            console.log("Initializing provider...");
            const web3Provider = new ethers.providers.Web3Provider(this.provider, "any"); // "any" for chain flexibility
            this.signer = web3Provider.getSigner();
            this.account = account || await this.signer.getAddress();
            this.truncatedAccount = `${this.account.slice(0, 6)}...${this.account.slice(-4)}`;
            this.isConnected = true;
            const chainId = await web3Provider.getNetwork().then(net => net.chainId);
            console.log("Detected chain ID:", chainId);
            this.isPolygon = chainId === POLYGON_CHAIN_ID;
            await this.refreshPengBalance();
            await this.updateWpolCost();
            saveState(this.$data);
        },

        async handleNetworkSelection() {
            console.log("Network selection clicked");
            if (!this.isConnected) {
                console.log("Not connected, opening wallet modal");
                document.getElementById('walletModal').classList.add('show');
                return;
            }
            try {
                const web3Provider = new ethers.providers.Web3Provider(this.provider, "any");
                const chainId = await web3Provider.getNetwork().then(net => net.chainId);
                console.log("Current chain ID:", chainId);
                if (chainId !== POLYGON_CHAIN_ID) {
                    console.log("Switching to Polygon...");
                    try {
                        await this.provider.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: POLYGON_NETWORK_CONFIG.chainId }]
                        });
                    } catch (switchError) {
                        if (switchError.code === 4902) {
                            console.log("Adding Polygon network...");
                            await this.provider.request({
                                method: 'wallet_addEthereumChain',
                                params: [POLYGON_NETWORK_CONFIG]
                            });
                            await this.provider.request({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: POLYGON_NETWORK_CONFIG.chainId }]
                            });
                        } else {
                            throw switchError;
                        }
                    }
                }
                this.isPolygon = (await web3Provider.getNetwork().then(net => net.chainId)) === POLYGON_CHAIN_ID;
                console.log("Updated isPolygon:", this.isPolygon);
                saveState(this.$data);
            } catch (e) {
                console.error("Network switch failed:", e);
                alert(`Network switch failed: ${e.message}`);
            }
        },

        async refreshPengBalance() {
            if (!this.signer) return;
            try {
                const pengContract = new ethers.Contract(PENG_NFT_ADDRESS, PENG_NFT_ABI, this.signer);
                const balance = await pengContract.balanceOf(this.account);
                this.pengBalance = balance.toNumber();
                console.log("Peng balance:", this.pengBalance);
                saveState(this.$data);
            } catch (e) {
                console.error("Failed to fetch Peng balance:", e);
                this.pengBalance = 0;
            }
        },

        showDispenseModal() {
            console.log("Showing dispense modal");
            this.updateWpolCost();
        },

        async updateWpolCost() {
            console.log("Updating WPOL cost...");
            try {
                const lusdAmount = ethers.utils.parseUnits(this.dispenseAmount || "0", 18);
                if (!this.signer) {
                    // Fallback for no wallet
                    const lusdContract = new ethers.Contract(LUSD_ADDRESS, LUSD_ABI, fallbackProvider);
                    const price = await lusdContract.getPrice();
                    console.log("Fallback price:", price.toString());
                    const wpolAmount = lusdAmount.mul(ethers.BigNumber.from(10).pow(26)).div(price);
                    this.wpolCost = `${ethers.utils.formatUnits(wpolAmount, 18)} WPOL`;
                    this.needsApproval = false; // No approval without signer
                    console.log("No signer, static WPOL cost:", this.wpolCost);
                } else {
                    const chainId = await this.signer.getChainId();
                    this.isPolygon = chainId === POLYGON_CHAIN_ID;
                    console.log("Signer chain ID:", chainId);
                    const lusdContract = new ethers.Contract(LUSD_ADDRESS, LUSD_ABI, this.signer);
                    const price = await lusdContract.getPrice();
                    console.log("Fetched price:", price.toString());
                    const wpolAmount = lusdAmount.mul(ethers.BigNumber.from(10).pow(26)).div(price);
                    this.wpolCost = `${ethers.utils.formatUnits(wpolAmount, 18)} WPOL`;
                    const wpolContract = new ethers.Contract(WPOL_ADDRESS, WPOL_ABI, this.signer);
                    const allowance = await wpolContract.allowance(this.account, DISPENSER_ADDRESS);
                    this.needsApproval = wpolAmount.gt(allowance);
                    console.log("WPOL cost:", this.wpolCost, "Needs approval:", this.needsApproval);
                }
                saveState(this.$data);
            } catch (e) {
                console.error("Error calculating WPOL cost:", e);
                this.wpolCost = "Error";
                this.needsApproval = false;
            }
        },

        executeDispenseOrApprove: debounce(async function() {
            console.log("Executing dispense or approve...");
            if (!this.signer || !this.isPolygon) {
                console.log("Not connected to Polygon");
                alert("Connect wallet to Polygon first");
                return;
            }
            try {
                const lusdAmount = ethers.utils.parseUnits(this.dispenseAmount, 18);
                const lusdContract = new ethers.Contract(LUSD_ADDRESS, LUSD_ABI, this.signer);
                const price = await lusdContract.getPrice();
                const wpolAmount = lusdAmount.mul(ethers.BigNumber.from(10).pow(26)).div(price);
                const wpolContract = new ethers.Contract(WPOL_ADDRESS, WPOL_ABI, this.signer);
                if (this.needsApproval) {
                    console.log("Approving WPOL...");
                    const txApprove = await wpolContract.approve(DISPENSER_ADDRESS, wpolAmount);
                    await txApprove.wait();
                    this.needsApproval = false;
                    this.updateWpolCost();
                    console.log("Approval successful");
                    return;
                }
                console.log("Executing dispense...");
                const dispenserContract = new ethers.Contract(DISPENSER_ADDRESS, DISPENSER_ABI, this.signer);
                const tx = await dispenserContract.convert(lusdAmount);
                await tx.wait();
                this.dispenseAmount = "1.0";
                document.getElementById('dispenserModal').classList.remove('show');
                console.log("Dispense executed");
                saveState(this.$data);
            } catch (e) {
                console.error("Dispense/Approve failed:", e);
                alert(`Action failed: ${e.message}`);
            }
        }, 300),

        executeFreebase: debounce(async function() {
            console.log("Executing freebase...");
            if (!this.signer || !this.isPolygon) {
                console.log("Not connected to Polygon");
                alert("Connect wallet to Polygon first");
                return;
            }
            try {
                const freebaseContract = new ethers.Contract(FREE_BASER_ADDRESS, FREE_BASER_ABI, this.signer);
                const tx = await freebaseContract.freebase();
                await tx.wait();
                console.log("Freebase executed");
            } catch (e) {
                console.error("Freebase failed:", e);
                alert(`Freebase failed: ${e.message}`);
            }
        }, 300),

        disconnectWallet() {
            console.log("Disconnecting wallet...");
            if (this.provider?.disconnect) this.provider.disconnect();
            this.isConnected = false;
            this.account = null;
            this.truncatedAccount = null;
            this.isPolygon = false;
            this.pengBalance = 0;
            this.provider = null;
            this.signer = null;
            this.wcUri = null;
            this.showDisconnectModal = false;
            document.getElementById('disconnectModal').classList.remove('show');
            saveState(this.$data);
        },

        toggleDarkMode() {
            console.log("Toggling dark mode...");
            this.isDarkMode = !this.isDarkMode;
            document.body.classList.toggle("dark-mode", this.isDarkMode);
            saveState(this.$data);
        }
    };
}

// --- State Persistence ---
const saveState = (state) => {
    const { provider, signer, ...persistable } = state;
    localStorage.setItem('appState', JSON.stringify(persistable));
};
const loadState = () => JSON.parse(localStorage.getItem('appState') || '{}');

// Log to confirm loading
console.log("custom.js loaded");