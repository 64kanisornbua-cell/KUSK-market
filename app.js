// ==========================================
// KUSK Market - Main Application Logic
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyBsQTRM3u47_MywSl1X4P4OwcYDGUQo3IE",
  authDomain: "kusk-market.firebaseapp.com",
  databaseURL: "https://kusk-market-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kusk-market",
  storageBucket: "kusk-market.firebasestorage.app",
  messagingSenderId: "19439365171",
  appId: "1:19439365171:web:0e2522d249e8022d904746",
  measurementId: "G-41KMMZVZEX"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- State Management ---
const SPECIAL_CODE = "ILOVEMYJOB";

const INITIAL_USERS = [
    { id: 'u_council_1', name: 'สภานักเรียน KUSK', username: 'สภานักเรียน KUSK', role: 'council', password: '123' },
    { id: 'u_kritamet', name: 'กฤตเมธ เพชรยวน', username: 'กฤตเมธ เพชรยวน', role: 'seller', password: '07303', grade: 'ม.5', tableId: 'T-01' }
];

let state = {
    currentUser: null, 
    users: [...INITIAL_USERS], 
    products: [], 
    currentCategory: 'all',
    currentCategoryCouncil: 'all',
    searchQuery: '',
    currentTab: 'pending',
    currentCouncilSection: 'products'
};

// --- Password Visibility Toggle ---
function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.innerText = 'visibility_off';
    } else {
        input.type = 'password';
        icon.innerText = 'visibility';
    }
}

// Helper to merge user lists safely without losing local/initial users
function mergeUsers(newUsers) {
    if (!Array.isArray(newUsers)) return;
    const map = new Map();
    [...INITIAL_USERS, ...(state.users || []), ...newUsers].forEach(u => {
        if (u && typeof u === 'object' && (u.id || u.name)) {
            const key = (u.id || u.name).toString().toLowerCase();
            map.set(key, u);
        }
    });
    state.users = Array.from(map.values());
    try { localStorage.setItem('kusk_local_users', JSON.stringify(state.users)); } catch(e){}
}

function saveOnExit() {
    try {
        saveAllLocalData();
        localStorage.setItem('kusk_cache_time', Date.now().toString());
    } catch(e){}
}
window.addEventListener('beforeunload', saveOnExit);
window.addEventListener('pagehide', saveOnExit);

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('kusk_currentUser');
    if (savedUser) {
        try { state.currentUser = JSON.parse(savedUser); } catch(e){}
    }

    // Load local users fallback
    const localUsers = localStorage.getItem('kusk_local_users');
    if (localUsers) {
        try { 
            const parsed = JSON.parse(localUsers); 
            mergeUsers(parsed);
        } catch(e){}
    }

    // Check cache timestamp. If cache is older than 30 mins, wipe stale local cache!
    const cacheTimeStr = localStorage.getItem('kusk_cache_time');
    if (cacheTimeStr) {
        const cacheAge = Date.now() - parseInt(cacheTimeStr);
        if (cacheAge > 30 * 60 * 1000) { // 30 minutes
            console.log('Stale local cache cleared (> 30 mins)');
            localStorage.removeItem('kusk_local_products');
        }
    }

    // Load fresh local products fallback
    const localProducts = localStorage.getItem('kusk_local_products');
    if (localProducts) {
        try { state.products = JSON.parse(localProducts); } catch(e){}
    }

    // Initialize UI and render immediately (Smooth & Fast)
    if (state.currentUser) {
        if (state.currentUser.suspended) {
            showToast('บัญชีของคุณถูกระงับชั่วคราว', 'error');
            handleLogout();
        } else {
            initApp();
        }
    } else {
        const authScreen = document.getElementById('authScreen');
        if (authScreen) authScreen.classList.add('active');
    }
    renderCurrentPage();

    // Pre-fetch & listen for live users from Firebase
    if (typeof db !== 'undefined') {
        db.ref('users').once('value').then(snapshot => {
            const data = snapshot.val();
            if (data) mergeUsers(Object.values(data));
        }).catch(err => console.warn('Init user fetch error:', err));
    }
    
    db.ref('users').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) mergeUsers(Object.values(data));
        if(state.currentUser && state.currentUser.role !== 'guest') {
            const updatedUser = state.users.find(u => u.id === state.currentUser.id);
            if(updatedUser) {
                if (updatedUser.suspended) {
                    showToast('บัญชีของคุณถูกระงับชั่วคราว กรุณาติดต่อสภานักเรียน', 'error');
                    handleLogout();
                    return;
                }
                state.currentUser = updatedUser;
                saveLocalUser();
            }
        }
        if (state.currentCouncilSection === 'sellers') {
            renderCouncilSellers();
        }
    }, (error) => console.warn('Firebase users read error:', error));

    // Listen for products directly from Firebase and update smoothly
    db.ref('products').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.products = Object.values(data).filter(p => p && typeof p === 'object' && p.id && p.name);
            localStorage.setItem('kusk_local_products', JSON.stringify(state.products));
            localStorage.setItem('kusk_cache_time', Date.now().toString());
        } else {
            state.products = [];
            localStorage.setItem('kusk_local_products', JSON.stringify([]));
        }
        renderCurrentPage();
        if (state.currentCouncilSection === 'report') {
            renderDailyReport();
        }
    }, (error) => {
        console.warn('Firebase products read error (using local data):', error);
        renderCurrentPage();
    });
});

function renderCurrentPage() {
    try { renderMarket(); } catch(e){}
    try { 
        if (state.currentUser && state.currentUser.role === 'seller') {
            renderSellerProducts(); 
        }
    } catch(e){}
    try { 
        if (state.currentUser && state.currentUser.role === 'council') {
            if (state.currentCouncilSection === 'products') renderCouncilProducts();
            if (state.currentCouncilSection === 'sellers') renderCouncilSellers();
            if (state.currentCouncilSection === 'report') renderDailyReport();
        }
    } catch(e){}
}

function saveLocalUser() {
    if (state.currentUser) {
        localStorage.setItem('kusk_currentUser', JSON.stringify(state.currentUser));
    } else {
        localStorage.removeItem('kusk_currentUser');
    }
}

function saveAllLocalData() {
    try {
        localStorage.setItem('kusk_local_users', JSON.stringify(state.users));
        localStorage.setItem('kusk_local_products', JSON.stringify(state.products));
    } catch(e){}
}

// Safely execute Firebase writes asynchronously isolated from UI
function safeFirebaseSave(path, data) {
    setTimeout(() => {
        try {
            if (typeof db !== 'undefined' && db && typeof db.ref === 'function') {
                if (data === null) {
                    db.ref(path).remove().catch(e => console.warn('FB remove warn:', e));
                } else {
                    db.ref(path).set(data).catch(e => console.warn('FB set warn:', e));
                }
            }
        } catch (err) {
            console.warn('Firebase safe save warning:', err);
        }
    }, 50);
}

// --- Image Compression Helper ---
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7)); // compress to 70% jpeg
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

// --- Authentication & Users ---

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    selectRole('seller'); // Default to Seller
}

function selectRole(role) {
    // Update active button
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`.role-btn[data-role="${role}"]`);
    if(btn) btn.classList.add('active');

    // Show/hide specific fields
    const sellerFields = document.getElementById('sellerFields');
    const specialCodeField = document.getElementById('specialCodeField');

    if(sellerFields) sellerFields.style.display = role === 'seller' ? 'block' : 'none';
    if(specialCodeField) specialCodeField.style.display = (role === 'seller' || role === 'council') ? 'block' : 'none';
}

function handleRegister() {
    const activeRoleBtn = document.querySelector('.role-btn.active');
    const role = activeRoleBtn ? activeRoleBtn.dataset.role : 'seller';

    const nameInput = document.getElementById('regName');
    const passwordInput = document.getElementById('regPassword');

    const name = nameInput ? String(nameInput.value || '').normalize('NFC').trim().replace(/\s+/g, ' ') : '';
    const password = passwordInput ? String(passwordInput.value || '').normalize('NFC').trim() : '';

    // 1. Validation check for required fields
    if (!name) {
        showToast('ลงทะเบียนไม่สำเร็จ: กรุณากรอกชื่อ-นามสกุลจริง', 'error');
        if(nameInput) nameInput.focus();
        return;
    }

    if (!password) {
        showToast('ลงทะเบียนไม่สำเร็จ: กรุณากำหนดรหัสผ่าน', 'error');
        if(passwordInput) passwordInput.focus();
        return;
    }

    // 2. Validation check for duplicate name
    const cleanName = name.toLowerCase();
    const existingUser = state.users.find(u => {
        if (!u) return false;
        const uName = String(u.name || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
        const uUsername = String(u.username || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
        return uName === cleanName || uUsername === cleanName;
    });
    if (existingUser) {
        showToast(`ลงทะเบียนไม่สำเร็จ: ชื่อ-นามสกุล "${name}" มีผู้ใช้งานในระบบแล้ว`, 'error');
        return;
    }

    // 3. Validation check for special code
    if (role === 'seller' || role === 'council') {
        const codeInput = document.getElementById('regSpecialCode');
        const code = codeInput ? codeInput.value.trim() : '';
        if (code !== SPECIAL_CODE) {
            showToast('ลงทะเบียนไม่สำเร็จ: รหัสเฉพาะไม่ถูกต้อง (กรุณากรอกรหัสเฉพาะจากสภา)', 'error');
            if(codeInput) codeInput.focus();
            return;
        }
    }

    // 4. Validation check for grade (for sellers)
    let grade = '';
    if (role === 'seller') {
        const gradeSelect = document.getElementById('regGrade');
        grade = gradeSelect ? gradeSelect.value : '';
        if (!grade) {
            showToast('ลงทะเบียนไม่สำเร็จ: กรุณาเลือกระดับชั้นของคุณ', 'error');
            if(gradeSelect) gradeSelect.focus();
            return;
        }
    }

    let newUser = {
        id: 'U' + Date.now(),
        name,
        username: name,
        password,
        role,
        grade,
        tableId: '',
        suspended: false
    };

    // Update local state immediately
    const existingIndex = state.users.findIndex(u => u.id === newUser.id);
    if (existingIndex > -1) {
        state.users[existingIndex] = newUser;
    } else {
        state.users.push(newUser);
    }
    saveAllLocalData();

    // Save to Firebase (with fallback if rules are locked)
    db.ref('users/' + newUser.id).set(newUser).then(() => {
        showToast('ลงทะเบียนผู้ขายสำเร็จ! กรุณาเข้าสู่ระบบด้วยชื่อและรหัสผ่าน');
        showLogin();
    }).catch(err => {
        console.warn('Firebase register error (saved locally):', err);
        showToast('ลงทะเบียนสำเร็จแล้ว! (บันทึกข้อมูลแล้ว)');
        showLogin();
    });
}


async function handleLogin() {
    try {
        const usernameEl = document.getElementById('loginUsername');
        const passwordEl = document.getElementById('loginPassword');

        const rawName = usernameEl ? usernameEl.value : '';
        const rawPass = passwordEl ? passwordEl.value : '';

        const cleanStr = (s) => String(s != null ? s : '').normalize('NFC').replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, ' ').trim();

        const inputName = cleanStr(rawName);
        const password = cleanStr(rawPass);

        if (!inputName || !password) {
            showToast('กรุณากรอกชื่อ-นามสกุลและรหัสผ่านให้ครบถ้วน', 'error');
            return;
        }

        // Make sure local users are loaded if state.users is empty
        if (!state.users || state.users.length === 0) {
            const localUsers = localStorage.getItem('kusk_local_users');
            if (localUsers) {
                try { state.users = JSON.parse(localUsers); } catch(e){}
            }
        }

        const matchUser = (u) => {
            if (!u) return false;

            const uName = cleanStr(u.name);
            const uUsername = cleanStr(u.username);
            const uPass = cleanStr(u.password);

            const inputNameLower = inputName.toLowerCase();
            const inputNameNoSpace = inputNameLower.replace(/\s+/g, '');

            const uNameLower = uName.toLowerCase();
            const uNameNoSpace = uNameLower.replace(/\s+/g, '');

            const uUserLower = uUsername.toLowerCase();
            const uUserNoSpace = uUserLower.replace(/\s+/g, '');

            const isNameMatch = (uNameLower === inputNameLower) ||
                                (uNameNoSpace === inputNameNoSpace) ||
                                (uUserLower === inputNameLower) ||
                                (uUserNoSpace === inputNameNoSpace);
            
            // Flexibly match password (handles leading 0 if stored as number, e.g. 07303 vs 7303)
            const passNoZero = password.replace(/^0+/, '');
            const uPassNoZero = uPass.replace(/^0+/, '');
            const isPassMatch = (uPass === password) || (uPass === passNoZero) || (uPassNoZero === passNoZero);

            return isNameMatch && isPassMatch;
        };

        let user = (state.users || []).find(matchUser);
        let hadQuotaError = false;

        // Fallback: If not found in current local state, fetch live users from Firebase (safely catching Quota errors)!
        if (!user && typeof db !== 'undefined') {
            try {
                const snapshot = await db.ref('users').once('value');
                const data = snapshot.val();
                if (data) {
                    state.users = Object.values(data).filter(u => u && typeof u === 'object' && u.name);
                    localStorage.setItem('kusk_local_users', JSON.stringify(state.users));
                    user = state.users.find(matchUser);
                }
            } catch (e) {
                console.warn('Firebase login fallback error (quota/network):', e);
                const errMsg = String(e && e.message ? e.message : e);
                if (errMsg.includes('quota') || errMsg.includes('Quota')) {
                    hadQuotaError = true;
                }
            }
        }

        if (user) {
            if (user.suspended) {
                showToast('บัญชีของคุณถูกระงับชั่วคราว กรุณาติดต่อสภานักเรียน', 'error');
                return;
            }
            state.currentUser = user;
            saveLocalUser();
            initApp();
            showToast('เข้าสู่ระบบสำเร็จ');
            if (user.role !== 'guest') closeProfileModal();
        } else if (hadQuotaError) {
            showToast('โควต้าฐานข้อมูลออนไลน์เต็มชั่วคราว (ระบบจะใช้อนุญาตจากข้อมูลในเครื่อง)', 'warning');
        } else {
            showToast('ชื่อ-นามสกุล หรือ รหัสผ่านไม่ถูกต้อง', 'error');
        }
    } catch (err) {
        console.error('handleLogin error:', err);
        const detail = (err && err.message) ? err.message : String(err);
        showToast('เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + detail, 'error');
    }
}

function enterAsGuest() {
    state.currentUser = {
        id: 'guest',
        name: 'ผู้เยี่ยมชม',
        role: 'guest'
    };
    initApp();
    showToast('เข้าสู่ระบบแบบผู้เยี่ยมชม');
}

function handleLogout() {
    state.currentUser = null;
    saveLocalUser();
    closeProfileModal();
    document.getElementById('mainApp').classList.remove('active');
    document.getElementById('authScreen').classList.add('active');
    
    // Clear inputs
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}

function formatSellDates(dates) {
    if (!dates || !Array.isArray(dates) || dates.length === 0) return '24, 25, 26 ส.ค.';
    return dates.map(d => `${d} ส.ค.`).join(', ');
}

// --- App Navigation & Setup ---

function initApp() {
    const authScreen = document.getElementById('authScreen');
    const mainApp = document.getElementById('mainApp');
    if (authScreen) authScreen.classList.remove('active');
    if (mainApp) mainApp.classList.add('active');

    // Setup Navigation
    const user = state.currentUser;
    if (!user) return;

    const navProfile = document.getElementById('navProfile');
    const navSeller = document.getElementById('navSeller');
    const navCouncil = document.getElementById('navCouncil');

    if (navProfile) navProfile.style.display = user.role === 'guest' ? 'none' : 'flex';
    if (navSeller) navSeller.style.display = user.role === 'seller' ? 'flex' : 'none';
    if (navCouncil) navCouncil.style.display = user.role === 'council' ? 'flex' : 'none';

    // Set Avatar (with null check)
    const avatarIcon = document.getElementById('userAvatar');
    if (avatarIcon) {
        if (user.role === 'seller' && user.image) {
            avatarIcon.innerHTML = `<img src="${user.image}" alt="Profile">`;
        } else {
            let iconName = 'person';
            if(user.role === 'council') iconName = 'verified_user';
            avatarIcon.innerHTML = `<span class="material-icons-round">${iconName}</span>`;
        }
    }

    // Default Page
    if (user.role === 'council') {
        navigateTo('council');
    } else if (user.role === 'seller') {
        navigateTo('seller');
    } else {
        navigateTo('market');
    }

    renderMarket(); // Pre-render market
}

function navigateTo(pageId) {
    // Update Nav
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const targetLink = document.querySelector(`.nav-link[data-page="${pageId}"]`);
    if(targetLink) targetLink.classList.add('active');

    // Update Pages
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId + 'Page').classList.add('active');

    // Load Specific Page Data
    if (pageId === 'market') renderMarket();
    if (pageId === 'seller') renderSellerProducts();
    if (pageId === 'council') renderCouncilProducts();
}

// --- UI Helpers ---

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');

    toast.className = 'toast';
    if (type === 'error') {
        toast.classList.add('error');
        icon.innerText = 'error';
    } else if (type === 'warning') {
        toast.classList.add('warning');
        icon.innerText = 'warning';
    } else {
        icon.innerText = 'check_circle';
    }

    msg.innerText = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

function formatPrice(price) {
    return new Intl.NumberFormat('th-TH').format(price);
}

function findSeller(sellerId) {
    if (!sellerId) return null;
    const cleanId = String(sellerId).trim().toLowerCase();
    
    // 1. Match by exact ID
    let seller = state.users.find(u => u && u.id && String(u.id).trim().toLowerCase() === cleanId);
    if (seller) return seller;

    // 2. Match by Name or Username fallback
    const cleanNoSpace = cleanId.replace(/\s+/g, '');
    seller = state.users.find(u => {
        if (!u) return false;
        const uName = String(u.name || '').trim().toLowerCase();
        const uUser = String(u.username || '').trim().toLowerCase();
        return uName === cleanId || uUser === cleanId || uName.replace(/\s+/g, '') === cleanNoSpace || uUser.replace(/\s+/g, '') === cleanNoSpace;
    });

    return seller;
}

function getCategoryName(catId) {
    const categories = {
        'clothing': '👕 เสื้อผ้า',
        'books': '📚 หนังสือ',
        'electronics': '📱 อิเล็กทรอนิกส์',
        'stationery': '✏️ เครื่องเขียน',
        'accessories': '💍 เครื่องประดับ',
        'sports': '⚽ กีฬา',
        'toys': '🧸 ของเล่น',
        'others': '📦 อื่นๆ'
    };
    return categories[catId] || 'อื่นๆ';
}

function getStatusBadge(status) {
    switch (status) {
        case 'pending': return '<span class="list-item-status status-pending"><span class="material-icons-round" style="font-size:14px">hourglass_empty</span>รอตรวจสอบ</span>';
        case 'approved': return '<span class="list-item-status status-approved"><span class="material-icons-round" style="font-size:14px">check_circle</span>ผ่านแล้ว (ขายในตลาด)</span>';
        case 'revision': return '<span class="list-item-status status-revision"><span class="material-icons-round" style="font-size:14px">edit_note</span>ต้องแก้ไข</span>';
        case 'sold': return '<span class="list-item-status status-sold"><span class="material-icons-round" style="font-size:14px">shopping_bag</span>ขายแล้ว</span>';
        default: return '';
    }
}

function formatSellDates(dates) {
    if (!dates || !Array.isArray(dates) || dates.length === 0) return '24, 25, 26 ส.ค.';
    return dates.map(d => `${d} ส.ค.`).join(', ');
}

// --- Product Management (Seller) ---

function compressImage(file, callback) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600;
            const MAX_HEIGHT = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

let tempProductImage = '';
function previewProductImage(input) {
    if (input.files && input.files[0]) {
        compressImage(input.files[0], (compressedDataUrl) => {
            tempProductImage = compressedDataUrl;
            const preview = document.getElementById('productImagePreview');
            const placeholder = document.getElementById('productImagePlaceholder');
            if (preview) {
                preview.src = tempProductImage;
                preview.style.display = 'block';
            }
            if (placeholder) placeholder.style.display = 'none';
        });
    }
}

function toggleQuantityInput() {
    const type = document.querySelector('input[name="productQuantityType"]:checked').value;
    document.getElementById('quantityInputGroup').style.display = type === 'multiple' ? 'block' : 'none';
}

function openAddProductModal(productId = null) {
    const modal = document.getElementById('productModal');
    const title = document.getElementById('modalTitle');
    const noteArea = document.getElementById('revisionNote');
    
    // Reset Form
    document.getElementById('editProductId').value = '';
    tempProductImage = '';
    document.getElementById('productImagePreview').src = '';
    document.getElementById('productImagePreview').style.display = 'none';
    document.getElementById('productImagePlaceholder').style.display = 'flex';
    document.getElementById('productName').value = '';
    document.getElementById('productCategory').value = '';
    document.getElementById('productOriginalPrice').value = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productDefects').value = '';
    document.querySelectorAll('.product-sell-date').forEach(cb => cb.checked = true);
    document.querySelector('input[name="productQuantityType"][value="single"]').checked = true;
    document.getElementById('productQuantity').value = '1';
    toggleQuantityInput();
    noteArea.style.display = 'none';

    if (productId) {
        title.innerText = 'แก้ไขสินค้า';
        const product = state.products.find(p => p.id === productId);
        if (product) {
            document.getElementById('editProductId').value = product.id;
            
            if (product.image) {
                tempProductImage = product.image;
                document.getElementById('productImagePreview').src = product.image;
                document.getElementById('productImagePreview').style.display = 'block';
                document.getElementById('productImagePlaceholder').style.display = 'none';
            }

            document.getElementById('productName').value = product.name;
            document.getElementById('productCategory').value = product.category;
            document.getElementById('productOriginalPrice').value = product.originalPrice || '';
            document.getElementById('productPrice').value = product.price;
            document.getElementById('productDefects').value = product.defects || '';
            
            // Set sell dates
            if (product.sellDates && Array.isArray(product.sellDates)) {
                document.querySelectorAll('.product-sell-date').forEach(cb => {
                    cb.checked = product.sellDates.includes(cb.value);
                });
            }

            if (product.quantityType === 'multiple') {
                document.querySelector('input[name="productQuantityType"][value="multiple"]').checked = true;
                document.getElementById('productQuantity').value = product.quantity || 1;
            } else {
                document.querySelector('input[name="productQuantityType"][value="single"]').checked = true;
            }
            toggleQuantityInput();

            if (product.status === 'revision' && product.revisionNote) {
                noteArea.style.display = 'flex';
                document.getElementById('revisionNoteText').innerText = product.revisionNote;
            }
        }
    } else {
        title.innerText = 'เพิ่มสินค้าใหม่';
    }

    modal.classList.add('active');
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
}

function saveProduct() {
    try {
        if (!state.currentUser) {
            showToast('กรุณาเข้าสู่ระบบใหม่ก่อนเพิ่มสินค้า', 'error');
            return;
        }

        const id = document.getElementById('editProductId').value;
        const name = document.getElementById('productName').value.trim();
        const category = document.getElementById('productCategory').value;
        const originalPrice = parseInt(document.getElementById('productOriginalPrice').value);
        const price = parseInt(document.getElementById('productPrice').value);
        const defects = document.getElementById('productDefects').value.trim();
        
        const qTypeEl = document.querySelector('input[name="productQuantityType"]:checked');
        const quantityType = qTypeEl ? qTypeEl.value : 'single';
        const quantity = quantityType === 'multiple' ? parseInt(document.getElementById('productQuantity').value) : 1;

        // Get checked sell dates
        const sellDates = Array.from(document.querySelectorAll('.product-sell-date:checked')).map(cb => cb.value);

        // Specific validations with exact feedback toasts
        if (!tempProductImage) {
            showToast('กรุณาเลือกรูปภาพสินค้า', 'error');
            return;
        }
        if (!name) {
            showToast('กรุณากรอกชื่อสินค้า', 'error');
            return;
        }
        if (!category) {
            showToast('กรุณาเลือกประเภทสินค้า', 'error');
            return;
        }
        if (isNaN(originalPrice)) {
            showToast('กรุณากรอกราคาเดิม (ราคาเต็มมือหนึ่งหรือตอนซื้อใหม่)', 'error');
            return;
        }
        if (isNaN(price)) {
            showToast('กรุณากรอกราคาขายจริง', 'error');
            return;
        }
        if (quantityType === 'multiple' && (isNaN(quantity) || quantity < 1)) {
            showToast('กรุณากรอกจำนวนสินค้าให้ถูกต้อง', 'error');
            return;
        }
        if (sellDates.length === 0) {
            showToast('กรุณาเลือกวันที่นำสินค้ามาขายอย่างน้อย 1 วัน', 'error');
            return;
        }

        // Price rules validation
        if (price > 400) {
            showToast('ราคาขายจริงต้องไม่เกิน 400 บาทเท่านั้น', 'error');
            return;
        }

        if (price >= originalPrice) {
            showToast('ราคาขายจริงต้องน้อยกว่าราคาเดิม (ไม่สามารถเท่ากับหรือแพงกว่าได้)', 'error');
            return;
        }

        let productData;
        if (id) {
            // Edit existing
            const index = state.products.findIndex(p => p.id === id);
            if (index > -1) {
                productData = {
                    ...state.products[index],
                    sellerName: (state.currentUser && state.currentUser.name) ? state.currentUser.name : (state.products[index].sellerName || ''),
                    sellerGrade: (state.currentUser && state.currentUser.grade) ? state.currentUser.grade : (state.products[index].sellerGrade || ''),
                    tableId: (state.currentUser && state.currentUser.tableId) ? state.currentUser.tableId : (state.products[index].tableId || ''),
                    name, category, price, originalPrice, sellDates, defects, quantityType, quantity,
                    image: tempProductImage,
                    status: 'pending', // Reset to pending after edit
                    revisionNote: null,
                    updatedAt: new Date().toISOString()
                };
            }
        } else {
            // Add new
            productData = {
                id: 'P' + Date.now(),
                sellerId: (state.currentUser && state.currentUser.id) ? state.currentUser.id : 'seller_anon',
                sellerName: (state.currentUser && state.currentUser.name) ? state.currentUser.name : '',
                sellerGrade: (state.currentUser && state.currentUser.grade) ? state.currentUser.grade : '',
                tableId: (state.currentUser && state.currentUser.tableId) ? state.currentUser.tableId : '',
                name, category, price, originalPrice, sellDates, defects, quantityType, quantity,
                image: tempProductImage,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
        }

        if (productData) {
            // Save to local state & localStorage first
            const pIndex = state.products.findIndex(p => p.id === productData.id);
            if (pIndex > -1) {
                state.products[pIndex] = productData;
            } else {
                state.products.push(productData);
            }
            saveAllLocalData();

            // Show success toast, close modal, and update screen immediately!
            showToast(id ? 'อัปเดตสินค้าเรียบร้อยแล้ว' : 'เพิ่มสินค้าและส่งตรวจสอบเรียบร้อยแล้ว');
            closeProductModal();
            renderCurrentPage();

            // Safely attempt sync to Firebase asynchronously outside current call stack
            safeFirebaseSave('products/' + productData.id, productData);
        }
    } catch (err) {
        console.error('saveProduct error:', err);
        showToast('เกิดข้อผิดพลาดในการบันทึกสินค้า: ' + (err.message || err), 'error');
    }
}

function markAsSold(productId) {
    if(confirm('ยืนยันว่าสินค้านี้ขายออกแล้วใช่หรือไม่?')) {
        const product = state.products.find(p => p.id === productId);
        if (product) {
            product.status = 'sold';
            saveAllLocalData();
            safeFirebaseSave('products/' + product.id + '/status', 'sold');
            showToast('ทำเครื่องหมายว่าขายแล้ว');
            renderSellerProducts();
            renderMarket();
        }
    }
}

function undoSold(productId) {
    if(confirm('ต้องการยกเลิกสถานะขายแล้ว และนำกลับมาขายใหม่ใช่หรือไม่?')) {
        const product = state.products.find(p => p.id === productId);
        if (product) {
            product.status = 'approved';
            saveAllLocalData();
            safeFirebaseSave('products/' + product.id + '/status', 'approved');
            showToast('นำสินค้ากลับมาขายใหม่แล้ว');
            renderSellerProducts();
            renderMarket();
        }
    }
}

function deleteProductBySeller(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    if (confirm(`คุณต้องการลบสินค้า "${product.name}" ออกจากระบบใช่หรือไม่?`)) {
        // 1. Remove from local state
        state.products = state.products.filter(p => p.id !== productId);
        saveAllLocalData();

        // 2. Remove from Firebase via safeFirebaseSave
        safeFirebaseSave('products/' + productId, null);

        // 3. UI Feedback & re-render
        showToast(`ลบสินค้า "${product.name}" เรียบร้อยแล้ว`);
        renderSellerProducts();
        renderMarket();
    }
}

function renderSellerProducts() {
    const container = document.getElementById('sellerProducts');
    const myProducts = state.products.filter(p => p.sellerId === state.currentUser.id);
    
    // Calculate total revenue from sold products
    const soldProducts = myProducts.filter(p => p.status === 'sold');
    const totalRevenue = soldProducts.reduce((sum, p) => sum + (p.price * (p.quantityType === 'multiple' ? (p.quantity || 1) : 1)), 0);
    document.getElementById('sStatRevenue').innerText = '฿' + formatPrice(totalRevenue);

    // Update Dashboard Stats
    document.getElementById('sStatTotal').innerText = myProducts.length;
    document.getElementById('sStatPending').innerText = myProducts.filter(p => p.status === 'pending').length;
    document.getElementById('sStatRevision').innerText = myProducts.filter(p => p.status === 'revision').length;
    document.getElementById('sStatSelling').innerText = myProducts.filter(p => p.status === 'approved').length;
    document.getElementById('sStatSold').innerText = soldProducts.length;

    // Sort: pending/revision first, then approved, then sold
    myProducts.sort((a, b) => {
        const statusWeight = { 'revision': 0, 'pending': 1, 'approved': 2, 'sold': 3 };
        return statusWeight[a.status] - statusWeight[b.status];
    });

    if (myProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">inventory_2</span>
                <h3>ยังไม่มีสินค้า</h3>
                <p>กดปุ่ม "เพิ่มสินค้าใหม่" เพื่อลงทะเบียนสินค้า</p>
            </div>
        `;
        return;
    }

    container.innerHTML = myProducts.map(p => `
        <div class="list-item">
            <img src="${p.image}" class="list-item-img" alt="${p.name}">
            <div class="list-item-info">
                <div class="list-item-title">${p.name} ${p.quantityType === 'multiple' ? `<small class="text-muted">(มี ${p.quantity} ชิ้น)</small>` : ''}</div>
                <div class="list-item-price">
                    ฿${formatPrice(p.price)}
                    ${p.originalPrice ? `<span class="price-original-strikethrough">฿${formatPrice(p.originalPrice)}</span>` : ''}
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">📅 วันขาย: ${formatSellDates(p.sellDates)}</div>
                ${getStatusBadge(p.status)}
            </div>
            <div class="list-item-actions">
                ${(p.status === 'pending' || p.status === 'revision' || p.status === 'approved') ? 
                    `<button class="btn btn-outline" onclick="openAddProductModal('${p.id}')">
                        <span class="material-icons-round">edit</span> แก้ไข
                    </button>` : ''
                }
                ${p.status === 'approved' ? 
                    `<button class="btn btn-success" onclick="markAsSold('${p.id}')">
                        <span class="material-icons-round">monetization_on</span> ขายแล้ว
                    </button>` : ''
                }
                ${p.status === 'sold' ? 
                    `<button class="btn btn-outline" onclick="undoSold('${p.id}')">
                        <span class="material-icons-round">undo</span> ยกเลิกขาย
                    </button>` : ''
                }
                <button class="btn btn-outline" onclick="deleteProductBySeller('${p.id}')" style="color:var(--danger); border-color:var(--danger);">
                    <span class="material-icons-round">delete</span> ลบ
                </button>
            </div>
        </div>
    `).join('');
}


// --- Council Sections & Review ---

function switchCouncilSection(sectionId) {
    state.currentCouncilSection = sectionId;
    
    document.querySelectorAll('.council-nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.council-nav-btn[data-sec="${sectionId}"]`);
    if(activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.council-section').forEach(sec => sec.style.display = 'none');
    
    if (sectionId === 'products') {
        document.getElementById('councilSectionProducts').style.display = 'block';
        renderCouncilProducts();
    } else if (sectionId === 'sellers') {
        document.getElementById('councilSectionSellers').style.display = 'block';
        renderCouncilSellers();
    } else if (sectionId === 'report') {
        document.getElementById('councilSectionReport').style.display = 'block';
        renderDailyReport();
    }
}

function switchCouncilTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.council-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.council-tabs .tab[data-tab="${tab}"]`).classList.add('active');
    renderCouncilProducts();
}

function updateCouncilCategoryChipCounts() {
    const categoryCounts = { all: state.products.length };
    state.products.forEach(p => {
        if (p.category) {
            categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
        }
    });

    const categoryNames = {
        'all': 'ทั้งหมด',
        'clothing': '👕 เสื้อผ้า',
        'books': '📚 หนังสือ',
        'electronics': '📱 อิเล็กทรอนิกส์',
        'stationery': '✏️ เครื่องเขียน',
        'accessories': '💍 เครื่องประดับ',
        'sports': '⚽ กีฬา',
        'toys': '🧸 ของเล่น',
        'others': '📦 อื่นๆ'
    };

    document.querySelectorAll('.council-filters .chip').forEach(chip => {
        const cat = chip.getAttribute('data-category');
        if (cat && categoryNames[cat]) {
            const count = categoryCounts[cat] || 0;
            chip.innerText = `${categoryNames[cat]} (${count})`;
        }
    });
}

function updateCouncilTabCounts(categoryProducts) {
    const pendingCount = categoryProducts.filter(p => p.status === 'pending').length;
    const revisionCount = categoryProducts.filter(p => p.status === 'revision').length;
    const approvedCount = categoryProducts.filter(p => p.status === 'approved' || p.status === 'sold').length;

    const pendingTabBtn = document.querySelector('.council-tabs .tab[data-tab="pending"]');
    const revisionTabBtn = document.querySelector('.council-tabs .tab[data-tab="revision"]');
    const approvedTabBtn = document.querySelector('.council-tabs .tab[data-tab="approved"]');

    if (pendingTabBtn) {
        pendingTabBtn.innerHTML = `<span class="material-icons-round">pending_actions</span> รอตรวจสอบ <span class="badge" id="pendingBadge">${pendingCount}</span>`;
        const badge = pendingTabBtn.querySelector('.badge');
        if (badge) badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

    if (revisionTabBtn) {
        revisionTabBtn.innerHTML = `<span class="material-icons-round">edit_note</span> ส่งแก้ไข (${revisionCount})`;
    }

    if (approvedTabBtn) {
        approvedTabBtn.innerHTML = `<span class="material-icons-round">check_circle</span> ผ่านแล้ว (${approvedCount})`;
    }
}

function renderCouncilProducts() {
    const container = document.getElementById('councilProducts');
    if (!container) return;
    
    // Category-filtered pool
    const activeCategory = state.currentCategoryCouncil || 'all';
    const categoryProducts = activeCategory === 'all' 
        ? state.products 
        : state.products.filter(p => p.category === activeCategory);

    // Update Category-aware Stat Cards
    const pendingCount = categoryProducts.filter(p => p.status === 'pending').length;
    const approvedCount = categoryProducts.filter(p => p.status === 'approved' || p.status === 'sold').length;
    
    const statPendingEl = document.getElementById('statPending');
    const statApprovedEl = document.getElementById('statApproved');
    if (statPendingEl) statPendingEl.innerText = pendingCount;
    if (statApprovedEl) statApprovedEl.innerText = approvedCount;

    // Update Category Chips & Tab Counts
    updateCouncilCategoryChipCounts();
    updateCouncilTabCounts(categoryProducts);

    let productsToShow = categoryProducts.filter(p => p.status === state.currentTab);

    if (productsToShow.length === 0) {
        const tabLabel = state.currentTab === 'pending' ? 'รอตรวจสอบ' : state.currentTab === 'revision' ? 'ส่งแก้ไข' : 'ผ่านแล้ว';
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">fact_check</span>
                <h3>ไม่มีสินค้าในสถานะ "${tabLabel}" สำหรับหมวดหมู่นี้</h3>
            </div>
        `;
        return;
    }

    container.innerHTML = productsToShow.map(p => {
        const seller = findSeller(p.sellerId);
        const tableIdText = seller && seller.tableId ? seller.tableId : 'ยังไม่กำหนด';
        return `
            <div class="product-card" onclick="openReviewModal('${p.id}')">
                <div class="product-image">
                    <img src="${p.image}" alt="${p.name}">
                    <span class="product-badge badge-${p.status}">
                        ${p.status === 'pending' ? 'รอตรวจ' : p.status === 'revision' ? 'รอแก้ไข' : 'ผ่าน'}
                    </span>
                </div>
                <div class="product-info">
                    <div class="product-title">${p.name} ${p.quantityType === 'multiple' ? `<small class="text-muted">(มี ${p.quantity} ชิ้น)</small>` : ''}</div>
                    <div class="product-price">
                        ฿${formatPrice(p.price)}
                        ${p.originalPrice ? `<span class="price-original-strikethrough">฿${formatPrice(p.originalPrice)}</span>` : ''}
                    </div>
                    <div class="product-meta">
                        <span class="material-icons-round">storefront</span> โต๊ะ ${tableIdText}
                        <span style="margin-left:auto">${getCategoryName(p.category).split(' ')[1]}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openReviewModal(productId) {
    const product = state.products.find(p => p.id === productId);
    const seller = product ? findSeller(product.sellerId) : null;
    
    if (!product) return;

    document.getElementById('reviewProductId').value = productId;
    
    const body = document.getElementById('reviewModalBody');
    const tableIdText = seller && seller.tableId ? seller.tableId : 'ยังไม่กำหนดรหัสโต๊ะ';

    body.innerHTML = `
        <div class="detail-layout">
            <div class="detail-image">
                <img src="${product.image}" alt="${product.name}">
            </div>
            <div class="detail-info">
                <h3>${product.name}</h3>
                <div class="detail-price">
                    ฿${formatPrice(product.price)}
                    ${product.originalPrice ? `<span class="price-original-strikethrough" style="font-size:1.1rem">฿${formatPrice(product.originalPrice)}</span>` : ''}
                </div>
                
                <div class="detail-section">
                    <h4>ประเภทสินค้า & วันที่วางขาย</h4>
                    <p>${getCategoryName(product.category)} | 📅 ${formatSellDates(product.sellDates)}</p>
                </div>
                
                <div class="detail-section">
                    <h4>ตำหนิ / สภาพ</h4>
                    <p>${product.defects || 'ไม่มี'}</p>
                </div>

                <div class="seller-profile-card">
                    <div style="width:40px; height:40px; border-radius:50%; background:rgba(79,70,229,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <span class="material-icons-round" style="font-size:22px;">storefront</span>
                    </div>
                    <div class="seller-profile-info">
                        <strong>ผู้ขาย: ${seller ? seller.name : 'ไม่พบข้อมูล'} (${seller ? seller.grade : '-'})</strong>
                        <span>รหัสโต๊ะ: ${tableIdText}</span>
                    </div>
                </div>
                
                ${product.status === 'revision' ? `
                <div class="revision-note" style="margin-top:1rem">
                    <span class="material-icons-round">warning</span>
                    <div>
                        <strong>สิ่งที่แจ้งให้แก้ไข:</strong>
                        <p>${product.revisionNote}</p>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    // Reset revision input
    document.getElementById('revisionInputGroup').style.display = 'none';
    document.getElementById('sendRevisionBtn').style.display = 'none';
    document.getElementById('revisionInput').value = '';

    // Show/hide action buttons based on status
    const actionArea = document.querySelector('.review-actions');
    const buttonsHTML = document.querySelector('.review-buttons');
    if (product.status === 'approved' || product.status === 'sold') {
        actionArea.style.display = 'flex';
        buttonsHTML.style.display = 'flex';
        buttonsHTML.innerHTML = `
            <button class="btn btn-danger" onclick="cancelApproval()">
                <span class="material-icons-round">cancel</span>
                ยกเลิกอนุมัติ
            </button>
        `;
        document.getElementById('sendRevisionBtn').style.display = 'none';
    } else {
        actionArea.style.display = 'flex';
        buttonsHTML.style.display = 'flex';
        buttonsHTML.innerHTML = `
            <button class="btn btn-warning" onclick="toggleRevisionInput()">
                <span class="material-icons-round">edit_note</span>
                ส่งแก้ไข
            </button>
            <button class="btn btn-success" onclick="approveProduct()">
                <span class="material-icons-round">check_circle</span>
                อนุมัติ
            </button>
        `;
        document.getElementById('sendRevisionBtn').style.display = 'none';
    }

    document.getElementById('reviewModal').classList.add('active');
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('active');
}

function toggleRevisionInput() {
    document.querySelector('.review-buttons').style.display = 'none';
    document.getElementById('revisionInputGroup').style.display = 'block';
    document.getElementById('sendRevisionBtn').style.display = 'block';
}

function sendRevision() {
    const id = document.getElementById('reviewProductId').value;
    const note = document.getElementById('revisionInput').value;

    if (!note) {
        showToast('กรุณาระบุสิ่งที่ต้องแก้ไข', 'error');
        return;
    }

    const product = state.products.find(p => p.id === id);
    if (product) {
        product.status = 'revision';
        product.revisionNote = note;
        saveAllLocalData();
        safeFirebaseSave('products/' + product.id, product);
        showToast('ส่งกลับให้ผู้ขายแก้ไขแล้ว', 'warning');
        closeReviewModal();
        renderCurrentPage();
    }
}

function approveProduct() {
    const id = document.getElementById('reviewProductId').value;
    const product = state.products.find(p => p.id === id);
    
    if (product) {
        product.status = 'approved';
        product.revisionNote = null;
        saveAllLocalData();
        safeFirebaseSave('products/' + product.id, product);
        showToast('อนุมัติสินค้าสำเร็จ สินค้าขึ้นตลาดแล้ว');
        closeReviewModal();
        renderCurrentPage();
    }
}

function cancelApproval() {
    if(confirm('ต้องการยกเลิกการอนุมัติสินค้านี้ใช่หรือไม่? (สินค้าจะกลับไปรอตรวจสอบใหม่)')) {
        const id = document.getElementById('reviewProductId').value;
        const product = state.products.find(p => p.id === id);
        
        if (product) {
            product.status = 'pending';
            saveAllLocalData();
            safeFirebaseSave('products/' + product.id, product);
            showToast('ยกเลิกอนุมัติสินค้าแล้ว');
            closeReviewModal();
            renderCurrentPage();
        }
    }
}

// --- Council Seller Management & Table ID Assignment ---

function renderCouncilSellers() {
    const container = document.getElementById('councilSellersList');
    if(!container) return;

    const query = (document.getElementById('sellerSearchInput')?.value || '').toLowerCase();
    
    let sellers = state.users.filter(u => u.role === 'seller');
    if (query) {
        sellers = sellers.filter(s => s.name.toLowerCase().includes(query) || (s.tableId && s.tableId.toLowerCase().includes(query)));
    }

    if (sellers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">group_off</span>
                <h3>ไม่พบผู้ขายในระบบ</h3>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="custom-table">
            <thead>
                <tr>
                    <th>ผู้ขาย (ชื่อ-นามสกุล)</th>
                    <th>ระดับชั้น</th>
                    <th>รหัสโต๊ะ (สภากำหนด)</th>
                    <th>สถานะการลงขาย</th>
                    <th>สถานะบัญชี</th>
                    <th>การจัดการ</th>
                </tr>
            </thead>
            <tbody>
                ${sellers.map(s => {
                    const sellerProducts = state.products.filter(p => {
                        const matchingSeller = findSeller(p.sellerId);
                        return (matchingSeller && matchingSeller.id === s.id) || p.sellerId === s.id || p.sellerName === s.name;
                    });

                    const approvedProducts = sellerProducts.filter(p => p.status === 'approved');
                    const pendingProducts = sellerProducts.filter(p => p.status === 'pending' || p.status === 'revision');

                    let statusBadge = '';
                    if (approvedProducts.length > 0) {
                        statusBadge = `<span style="background:rgba(16,185,129,0.12); color:#059669; font-weight:600; padding:0.2rem 0.55rem; border-radius:12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.2rem;"><span class="material-icons-round" style="font-size:14px;">check_circle</span> มีสินค้าขายอยู่ (${approvedProducts.length} ชิ้น)</span>`;
                    } else if (pendingProducts.length > 0) {
                        statusBadge = `<span style="background:rgba(245,158,11,0.12); color:#d97706; font-weight:600; padding:0.2rem 0.55rem; border-radius:12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.2rem;"><span class="material-icons-round" style="font-size:14px;">hourglass_empty</span> รอตรวจ (${pendingProducts.length} ชิ้น)</span>`;
                    } else {
                        statusBadge = `<span style="background:rgba(239,68,68,0.1); color:#dc2626; font-weight:500; padding:0.2rem 0.55rem; border-radius:12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.2rem;"><span class="material-icons-round" style="font-size:14px;">highlight_off</span> ยังไม่มีสินค้าขาย</span>`;
                    }

                    return `
                        <tr>
                            <td style="display:flex; align-items:center; gap:0.5rem;">
                                ${s.image ? 
                                    `<img src="${s.image}" style="width:34px; height:34px; border-radius:50%; object-fit:cover; flex-shrink:0;">` : 
                                    `<div style="width:34px; height:34px; border-radius:50%; background:rgba(79,70,229,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                        <span class="material-icons-round" style="font-size:18px">person</span>
                                    </div>`
                                }
                                <strong>${s.name}</strong>
                            </td>
                            <td>
                                <select id="gradeSelect_${s.id}" class="table-input" style="padding:0.25rem 0.4rem; font-size:0.8rem; min-width:75px;" onchange="saveSellerGrade('${s.id}')">
                                    <option value="ป.4" ${s.grade === 'ป.4' ? 'selected' : ''}>ป.4</option>
                                    <option value="ป.5" ${s.grade === 'ป.5' ? 'selected' : ''}>ป.5</option>
                                    <option value="ป.6" ${s.grade === 'ป.6' ? 'selected' : ''}>ป.6</option>
                                    <option value="ม.1" ${s.grade === 'ม.1' ? 'selected' : ''}>ม.1</option>
                                    <option value="ม.2" ${s.grade === 'ม.2' ? 'selected' : ''}>ม.2</option>
                                    <option value="ม.3" ${s.grade === 'ม.3' ? 'selected' : ''}>ม.3</option>
                                    <option value="ม.4" ${s.grade === 'ม.4' || !s.grade ? 'selected' : ''}>ม.4</option>
                                    <option value="ม.5" ${s.grade === 'ม.5' ? 'selected' : ''}>ม.5</option>
                                    <option value="ม.6" ${s.grade === 'ม.6' ? 'selected' : ''}>ม.6</option>
                                </select>
                            </td>
                            <td>
                                <div style="display:flex; gap:0.25rem;">
                                    <input type="text" id="tableIdInput_${s.id}" value="${s.tableId || ''}" placeholder="เช่น T-01" class="table-input">
                                    <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.8rem;" onclick="saveSellerTableId('${s.id}')">
                                        บันทึก
                                    </button>
                                </div>
                            </td>
                            <td>${statusBadge}</td>
                            <td>
                                ${s.suspended ? 
                                    `<span class="status-badge-suspended"><span class="material-icons-round" style="font-size:14px">block</span>ถูกระงับ</span>` : 
                                    `<span class="status-badge-active"><span class="material-icons-round" style="font-size:14px">check_circle</span>ปกติ</span>`
                                }
                            </td>
                            <td style="white-space:nowrap;">
                                <div style="display:flex; gap:0.35rem; align-items:center;">
                                    ${s.suspended ? 
                                        `<button class="btn btn-success" style="padding:0.35rem 0.65rem; font-size:0.8rem;" onclick="toggleSuspendSeller('${s.id}', false)">
                                            <span class="material-icons-round" style="font-size:15px">check</span> ปลดระงับ
                                         </button>` : 
                                        `<button class="btn btn-warning" style="padding:0.35rem 0.65rem; font-size:0.8rem; background:var(--warning); border-color:var(--warning); color:white;" onclick="toggleSuspendSeller('${s.id}', true)">
                                            <span class="material-icons-round" style="font-size:15px">block</span> ระงับบัญชี
                                         </button>`
                                    }
                                    <button class="btn btn-danger" style="padding:0.35rem 0.65rem; font-size:0.8rem;" onclick="deleteSellerAccount('${s.id}', '${s.name}')">
                                        <span class="material-icons-round" style="font-size:15px">delete</span> ลบบัญชี
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function saveSellerGrade(sellerId) {
    const select = document.getElementById(`gradeSelect_${sellerId}`);
    if (!select) return;
    const newGrade = select.value;

    const seller = findSeller(sellerId);
    if (seller) {
        seller.grade = newGrade;
        saveAllLocalData();
        safeFirebaseSave('users/' + seller.id + '/grade', newGrade);
        showToast(`อัปเดตระดับชั้นของ ${seller.name} เป็น ${newGrade} แล้ว`);
        renderCurrentPage();
    }
}

function saveSellerTableId(sellerId) {
    const input = document.getElementById(`tableIdInput_${sellerId}`);
    const gradeSelect = document.getElementById(`gradeSelect_${sellerId}`);
    if (!input) return;
    const newTableId = input.value.trim();
    const newGrade = gradeSelect ? gradeSelect.value : null;

    const seller = findSeller(sellerId);
    if (seller) {
        seller.tableId = newTableId;
        if (newGrade) seller.grade = newGrade;
        saveAllLocalData();
        safeFirebaseSave('users/' + seller.id, {
            ...seller,
            tableId: newTableId,
            grade: seller.grade
        });
        showToast('อัปเดตข้อมูลผู้ขายสำเร็จ');
        renderCurrentPage();
    }
}

function toggleSuspendSeller(sellerId, suspend) {
    const actionText = suspend ? 'ระงับบัญชีผู้ขายนี้ชั่วคราว (สินค้าทั้งหมดของผู้ขายจะถูกซ่อนออกจากตลาด)' : 'ปลดการระงับบัญชีผู้ขายนี้';
    if (confirm(`คุณต้องการ ${actionText} ใช่หรือไม่?`)) {
        const user = findSeller(sellerId);
        if (user) {
            user.suspended = suspend;
            saveAllLocalData();
            safeFirebaseSave('users/' + user.id + '/suspended', suspend);
            showToast(suspend ? 'ระงับบัญชีผู้ขายแล้ว (ซ่อนสินค้าออกจากตลาดเรียบร้อย)' : 'ปลดระงับบัญชีผู้ขายแล้ว');
            renderCurrentPage();
        }
    }
}

function deleteSellerAccount(sellerId, sellerName) {
    if (confirm(`คุณต้องการ "ลบบัญชีผู้ขาย" ของ ${sellerName} ใช่หรือไม่?\n\n⚠️ การลบจะลบบัญชีผู้ขายและสินค้าทั้งหมดของผู้ขายรายนี้ออกจากระบบถาวร และจะไม่สามารถกู้คืนได้`)) {
        const seller = findSeller(sellerId);
        const targetId = seller ? seller.id : sellerId;

        // 1. Remove seller's products
        const sellerProducts = state.products.filter(p => {
            const s = findSeller(p.sellerId);
            return (s && s.id === targetId) || p.sellerId === targetId;
        });
        sellerProducts.forEach(p => {
            safeFirebaseSave('products/' + p.id, null);
        });

        // 2. Remove user
        safeFirebaseSave('users/' + targetId, null);

        // 3. Remove from local state
        state.users = state.users.filter(u => u.id !== targetId);
        state.products = state.products.filter(p => {
            const s = findSeller(p.sellerId);
            return !(s && s.id === targetId) && p.sellerId !== targetId;
        });

        saveAllLocalData();
        showToast(`ลบบัญชีผู้ขาย "${sellerName}" และสินค้าทั้งหมดเรียบร้อยแล้ว`);
        renderCurrentPage();
    }
}


function openBulkImportModal() {
    document.getElementById('bulkImportInput').value = '';
    document.getElementById('bulkImportModal').classList.add('active');
}

function closeBulkImportModal() {
    document.getElementById('bulkImportModal').classList.remove('active');
}

function processBulkUserImport() {
    const rawText = document.getElementById('bulkImportInput').value.trim();
    if (!rawText) {
        showToast('กรุณากรอกข้อมูลผู้ขายที่ต้องการนำเข้า', 'error');
        return;
    }

    const lines = rawText.split('\n');
    let importedCount = 0;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Split by comma or tab
        const parts = trimmed.split(/[\t,]+/).map(p => p.trim());
        if (parts.length < 2) return;

        let name = parts[0];
        let username = name;
        let password = '';
        let grade = 'ม.4';
        let tableId = '';

        if (parts.length === 2) {
            // Format: ชื่อ-นามสกุล, รหัสผ่าน
            password = parts[1];
        } else if (parts.length === 3) {
            // Format: ชื่อ-นามสกุล, รหัสผ่าน, ระดับชั้น
            password = parts[1];
            grade = parts[2];
        } else if (parts.length === 4) {
            // Format: ชื่อ-นามสกุล, รหัสผ่าน, ระดับชั้น, รหัสโต๊ะ
            password = parts[1];
            grade = parts[2];
            tableId = parts[3];
        } else if (parts.length >= 5) {
            // Format: ชื่อ-นามสกุล, username, รหัสผ่าน, ระดับชั้น, รหัสโต๊ะ
            username = parts[1];
            password = parts[2];
            grade = parts[3];
            tableId = parts[4];
        }

        // Check if username exists
        const existingIndex = state.users.findIndex(u => 
            u.name.toLowerCase() === name.toLowerCase() || 
            (u.username && u.username.toLowerCase() === username.toLowerCase())
        );
        
        const sellerUser = {
            id: existingIndex > -1 ? state.users[existingIndex].id : 'U' + Date.now() + Math.floor(Math.random() * 1000),
            name,
            username,
            password,
            role: 'seller',
            grade,
            tableId,
            suspended: false
        };

        if (existingIndex > -1) {
            state.users[existingIndex] = { ...state.users[existingIndex], ...sellerUser };
        } else {
            state.users.push(sellerUser);
        }

        // Save to Firebase
        db.ref('users/' + sellerUser.id).set(sellerUser);
        importedCount++;
    });

    saveAllLocalData();
    showToast(`นำเข้าบัญชีผู้ขายสำเร็จ ${importedCount} รายการ!`);
    closeBulkImportModal();
    renderCouncilSellers();
}

// --- Council Daily Product Export ---

function renderDailyReport() {
    const container = document.getElementById('reportContainer');
    if (!container) return;

    const selectedDate = document.getElementById('reportDateSelect')?.value || '24';
    
    // Only products approved for sale on this date (sold items and suspended sellers are excluded)
    let products = state.products.filter(p => {
        if (p.status !== 'approved') return false; 
        const seller = findSeller(p.sellerId);
        if (seller && seller.suspended) return false;
        if (!p.sellDates || !Array.isArray(p.sellDates)) return true;
        return p.sellDates.some(d => String(d) === String(selectedDate));
    });

    // Sort products by seller name so items of the same seller are grouped together
    products.sort((a, b) => {
        const sellerA = (findSeller(a.sellerId)?.name || a.sellerName || a.sellerId || '').toLowerCase();
        const sellerB = (findSeller(b.sellerId)?.name || b.sellerName || b.sellerId || '').toLowerCase();
        return sellerA.localeCompare(sellerB, 'th');
    });

    // Calculate Total Physical Pieces
    let totalPieces = 0;
    products.forEach(p => {
        totalPieces += (p.quantityType === 'multiple' ? (parseInt(p.quantity) || 1) : 1);
    });

    // Generate Seller Status List
    const allSellers = state.users.filter(u => u.role === 'seller' && !u.suspended);
    allSellers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));

    const sellerStatusList = allSellers.map((s) => {
        const sellerProducts = state.products.filter(p => {
            const matchingSeller = findSeller(p.sellerId);
            return (matchingSeller && matchingSeller.id === s.id) || p.sellerId === s.id || p.sellerName === s.name;
        });

        const approvedProducts = sellerProducts.filter(p => {
            if (p.status !== 'approved') return false;
            if (!p.sellDates || !Array.isArray(p.sellDates)) return true;
            return p.sellDates.some(d => String(d) === String(selectedDate));
        });

        const pendingProducts = sellerProducts.filter(p => p.status === 'pending' || p.status === 'revision');

        let statusBadge = '';
        if (approvedProducts.length > 0) {
            statusBadge = `<span style="background:rgba(16,185,129,0.12); color:#059669; font-weight:600; padding:0.25rem 0.65rem; border-radius:12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.25rem;"><span class="material-icons-round" style="font-size:14px;">check_circle</span> มีสินค้าขายอยู่ (${approvedProducts.length} รายการ)</span>`;
        } else if (pendingProducts.length > 0) {
            statusBadge = `<span style="background:rgba(245,158,11,0.12); color:#d97706; font-weight:600; padding:0.25rem 0.65rem; border-radius:12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.25rem;"><span class="material-icons-round" style="font-size:14px;">hourglass_empty</span> รอตรวจสินค้า (${pendingProducts.length} รายการ)</span>`;
        } else {
            statusBadge = `<span style="background:rgba(239,68,68,0.1); color:#dc2626; font-weight:500; padding:0.25rem 0.65rem; border-radius:12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.25rem;"><span class="material-icons-round" style="font-size:14px;">highlight_off</span> ยังไม่มีสินค้าขาย</span>`;
        }

        return {
            seller: s,
            totalProducts: sellerProducts.length,
            approvedCount: approvedProducts.length,
            pendingCount: pendingProducts.length,
            statusBadge: statusBadge
        };
    });

    if (products.length === 0 && sellerStatusList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">find_in_page</span>
                <h3>ไม่มีรายการสินค้าที่จะวางขายในวันที่ ${selectedDate} สิงหาคม 2569</h3>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="padding:1rem 0;">
            <!-- 1. Daily Products Table -->
            <div style="text-align:center; margin-bottom:1.25rem;">
                <h2 style="font-size:1.4rem; font-weight:700;">📦 ตารางสินค้า ตลาดนัด KUSK Market</h2>
                <p style="color:var(--text-secondary);">ประจำวันที่ ${selectedDate} สิงหาคม 2569 (รวมทั้งหมด <strong>${products.length} รายการ</strong> / <strong>${totalPieces} ชิ้น</strong>)</p>
            </div>
            
            <div style="overflow-x:auto; margin-bottom:2.5rem;">
                <table class="custom-table" id="dailyReportTable">
                    <thead>
                        <tr>
                            <th style="width:50px;">ลำดับ</th>
                            <th>ชื่อสินค้า</th>
                            <th style="text-align:center;">จำนวน</th>
                            <th>ชื่อผู้ขาย</th>
                            <th>ระดับชั้น</th>
                            <th>รหัสโต๊ะ</th>
                            <th>ราคาขายจริง (บาท)</th>
                            <th>ราคาเดิม (บาท)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.length > 0 ? products.map((p, index) => {
                            const seller = findSeller(p.sellerId);
                            const sName = seller ? seller.name : (p.sellerName || p.sellerId || 'ผู้ขายที่ไม่ระบุ');
                            const sGrade = seller ? (seller.grade || '-') : (p.sellerGrade || '-');
                            const tableIdText = (seller && seller.tableId) ? seller.tableId : (p.tableId || 'ยังไม่กำหนด');
                            const qtyText = p.quantityType === 'multiple' ? `${p.quantity || 1} ชิ้น` : '1 ชิ้น';
                            return `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td><strong>${p.name}</strong></td>
                                    <td style="text-align:center;"><span style="background:rgba(79,70,229,0.08); color:var(--primary); font-weight:600; padding:0.2rem 0.55rem; border-radius:var(--radius-md); font-size:0.85rem;">${qtyText}</span></td>
                                    <td><strong>${sName}</strong></td>
                                    <td><span style="background:rgba(107,114,128,0.1); color:var(--text-secondary); padding:0.15rem 0.5rem; border-radius:6px; font-size:0.85rem; font-weight:500;">${sGrade}</span></td>
                                    <td><code>${tableIdText}</code></td>
                                    <td style="font-weight:700; color:var(--primary);">฿${formatPrice(p.price)}</td>
                                    <td style="color:var(--text-muted); text-decoration:line-through;">฿${formatPrice(p.originalPrice || p.price)}</td>
                                </tr>
                            `;
                        }).join('') : `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">ไม่มีรายการสินค้าอนุมัติในวันที่ ${selectedDate} ส.ค.</td></tr>`}
                    </tbody>
                </table>
            </div>

            <!-- 2. Seller Status Summary Table -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-top:2.5rem; margin-bottom:1.25rem;">
                <div>
                    <h2 style="font-size:1.3rem; font-weight:700;">🏪 ตารางสถานะการลงขายของผู้ขายทั้งหมด</h2>
                    <p style="color:var(--text-secondary);">สรุปการนำเข้าสินค้าของผู้ขายทุกราย ประจำวันที่ ${selectedDate} สิงหาคม 2569 (รวม ${sellerStatusList.length} คน)</p>
                </div>
                <button class="btn btn-outline print-hide" onclick="copySellerStatusTable()" style="padding:0.4rem 0.85rem; font-size:0.85rem;">
                    <span class="material-icons-round" style="font-size:16px;">content_copy</span> คัดลอกตารางผู้ขาย
                </button>
            </div>

            <div style="overflow-x:auto;">
                <table class="custom-table" id="sellerStatusReportTable">
                    <thead>
                        <tr>
                            <th style="width:50px;">ลำดับ</th>
                            <th>ผู้ขาย (ชื่อ-นามสกุล)</th>
                            <th>ระดับชั้น</th>
                            <th>รหัสโต๊ะ</th>
                            <th style="text-align:center;">สินค้าทั้งหมด</th>
                            <th style="text-align:center;">ผ่านอนุมัติ (${selectedDate} ส.ค.)</th>
                            <th>สถานะการลงขาย</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sellerStatusList.map((item, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td><strong>${item.seller.name}</strong></td>
                                <td><span style="background:rgba(107,114,128,0.1); color:var(--text-secondary); padding:0.15rem 0.5rem; border-radius:6px; font-size:0.85rem; font-weight:500;">${item.seller.grade || '-'}</span></td>
                                <td><code>${item.seller.tableId || 'ยังไม่กำหนด'}</code></td>
                                <td style="text-align:center; font-weight:600;">${item.totalProducts} รายการ</td>
                                <td style="text-align:center; font-weight:700; color:var(--primary);">${item.approvedCount} รายการ</td>
                                <td>${item.statusBadge}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function copyReportTable() {
    const selectedDate = document.getElementById('reportDateSelect')?.value || '24';
    let products = state.products.filter(p => {
        if (p.status !== 'approved' && p.status !== 'sold') return false;
        if (!p.sellDates || !Array.isArray(p.sellDates)) return true;
        return p.sellDates.some(d => String(d) === String(selectedDate));
    });

    products.sort((a, b) => {
        const sellerA = (findSeller(a.sellerId)?.name || a.sellerName || a.sellerId || '').toLowerCase();
        const sellerB = (findSeller(b.sellerId)?.name || b.sellerName || b.sellerId || '').toLowerCase();
        return sellerA.localeCompare(sellerB, 'th');
    });

    if (products.length === 0) {
        showToast('ไม่มีข้อมูลในตารางสำหรับคัดลอก', 'error');
        return;
    }

    let totalPieces = 0;
    products.forEach(p => {
        totalPieces += (p.quantityType === 'multiple' ? (parseInt(p.quantity) || 1) : 1);
    });

    let text = `ตารางสินค้า KUSK Market ประจำวันที่ ${selectedDate} สิงหาคม 2569 (รวมทั้งหมด ${products.length} รายการ / ${totalPieces} ชิ้น)\n`;
    text += `ลำดับ\tชื่อสินค้า\tจำนวน\tชื่อคนขาย\tระดับชั้น\tรหัสโต๊ะ\tราคาขายจริง (บาท)\tราคาเดิม (บาท)\n`;

    products.forEach((p, index) => {
        const seller = findSeller(p.sellerId);
        const sName = seller ? seller.name : (p.sellerName || p.sellerId || 'ผู้ขายที่ไม่ระบุ');
        const sGrade = seller ? (seller.grade || '-') : (p.sellerGrade || '-');
        const tableIdText = (seller && seller.tableId) ? seller.tableId : (p.tableId || 'ยังไม่กำหนด');
        const qtyText = p.quantityType === 'multiple' ? `${p.quantity || 1} ชิ้น` : '1 ชิ้น';
        text += `${index + 1}\t${p.name}\t${qtyText}\t${sName}\t${sGrade}\t${tableIdText}\t${p.price}\t${p.originalPrice || p.price}\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        showToast('คัดลอกตารางสินค้าลง Clipboard แล้ว!');
    }).catch(err => {
        showToast('ไม่สามารถคัดลอกได้', 'error');
        console.error(err);
    });
}

function copySellerStatusTable() {
    const selectedDate = document.getElementById('reportDateSelect')?.value || '24';
    const allSellers = state.users.filter(u => u.role === 'seller' && !u.suspended);
    allSellers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));

    if (allSellers.length === 0) {
        showToast('ไม่มีข้อมูลผู้ขายสำหรับคัดลอก', 'error');
        return;
    }

    let text = `ตารางสถานะการลงขายของผู้ขาย KUSK Market ประจำวันที่ ${selectedDate} สิงหาคม 2569\n`;
    text += `ลำดับ\tชื่อผู้ขาย\tระดับชั้น\tรหัสโต๊ะ\tสินค้าทั้งหมด\tผ่านอนุมัติ\tสถานะการลงขาย\n`;

    allSellers.forEach((s, index) => {
        const sellerProducts = state.products.filter(p => {
            const matchingSeller = findSeller(p.sellerId);
            return (matchingSeller && matchingSeller.id === s.id) || p.sellerId === s.id || p.sellerName === s.name;
        });

        const approvedProducts = sellerProducts.filter(p => {
            if (p.status !== 'approved') return false;
            if (!p.sellDates || !Array.isArray(p.sellDates)) return true;
            return p.sellDates.some(d => String(d) === String(selectedDate));
        });

        const pendingProducts = sellerProducts.filter(p => p.status === 'pending' || p.status === 'revision');

        let statusText = '';
        if (approvedProducts.length > 0) {
            statusText = `มีสินค้าขายอยู่ (${approvedProducts.length} รายการ)`;
        } else if (pendingProducts.length > 0) {
            statusText = `รอตรวจสินค้า (${pendingProducts.length} รายการ)`;
        } else {
            statusText = `ยังไม่มีสินค้าขาย`;
        }

        const tableIdText = s.tableId || 'ยังไม่กำหนด';
        const gradeText = s.grade || '-';
        text += `${index + 1}\t${s.name}\t${gradeText}\t${tableIdText}\t${sellerProducts.length}\t${approvedProducts.length}\t${statusText}\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        showToast('คัดลอกตารางผู้ขายลง Clipboard แล้ว!');
    }).catch(err => {
        showToast('ไม่สามารถคัดลอกได้', 'error');
        console.error(err);
    });
}


// --- Market Page ---

function filterByCategory(category, pageContext = 'market') {
    if (pageContext === 'market') {
        state.currentCategory = category;
        document.querySelectorAll('.filters-bar .chip').forEach(c => c.classList.remove('active'));
        document.querySelector(`.filters-bar .chip[data-category="${category}"]`)?.classList.add('active');
        filterProducts();
    } else if (pageContext === 'council') {
        state.currentCategoryCouncil = category;
        document.querySelectorAll('.council-filters .chip').forEach(c => c.classList.remove('active'));
        document.querySelector(`.council-filters .chip[data-category="${category}"]`)?.classList.add('active');
        renderCouncilProducts();
    }
}

function updateCategoryChipCounts() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const dateFilter = document.getElementById('dateFilter')?.value || 'all';
    const priceFilter = document.getElementById('priceFilter')?.value || 'all';

    const baseAvailable = state.products.filter(p => {
        if (p.status !== 'approved' && p.status !== 'sold') return false;
        const seller = findSeller(p.sellerId);
        if (seller && seller.suspended) return false;

        // Date Filter
        if (dateFilter !== 'all') {
            if (!p.sellDates || !Array.isArray(p.sellDates)) return false;
            if (!p.sellDates.some(d => String(d) === String(dateFilter))) return false;
        }

        // Search Filter
        if (search && !p.name.toLowerCase().includes(search)) return false;

        // Price Filter
        if (priceFilter !== 'all') {
            const [min, max] = priceFilter.split('-');
            if (max) {
                if (p.price < parseInt(min) || p.price > parseInt(max)) return false;
            } else {
                if (p.price < parseInt(min)) return false;
            }
        }

        return true;
    });

    const categoryCounts = { all: baseAvailable.length };
    baseAvailable.forEach(p => {
        if (p.category) {
            categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
        }
    });

    const categoryNames = {
        'all': 'ทั้งหมด',
        'clothing': '👕 เสื้อผ้า',
        'books': '📚 หนังสือ',
        'electronics': '📱 อิเล็กทรอนิกส์',
        'stationery': '✏️ เครื่องเขียน',
        'accessories': '💍 เครื่องประดับ',
        'sports': '⚽ กีฬา',
        'toys': '🧸 ของเล่น',
        'others': '📦 อื่นๆ'
    };

    document.querySelectorAll('.filters-bar .chip').forEach(chip => {
        const cat = chip.getAttribute('data-category');
        if (cat && categoryNames[cat]) {
            const count = categoryCounts[cat] || 0;
            chip.innerText = `${categoryNames[cat]} (${count})`;
        }
    });
}

function filterProducts() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const dateFilter = document.getElementById('dateFilter')?.value || 'all';
    const priceFilter = document.getElementById('priceFilter')?.value || 'all';
    const sortFilter = document.getElementById('sortFilter')?.value || 'newest';

    let filtered = state.products.filter(p => {
        // Only show approved or sold in market
        if (p.status !== 'approved' && p.status !== 'sold') return false;
        
        // Hide products of suspended sellers
        const seller = findSeller(p.sellerId);
        if (seller && seller.suspended) return false;

        // Date Filter (String loose comparison)
        if (dateFilter !== 'all') {
            if (!p.sellDates || !Array.isArray(p.sellDates)) return false;
            if (!p.sellDates.some(d => String(d) === String(dateFilter))) return false;
        }

        // Category
        if (state.currentCategory !== 'all' && p.category !== state.currentCategory) return false;
        
        // Search
        if (search && !p.name.toLowerCase().includes(search)) return false;

        // Price
        if (priceFilter !== 'all') {
            const [min, max] = priceFilter.split('-');
            if (max) {
                if (p.price < parseInt(min) || p.price > parseInt(max)) return false;
            } else {
                if (p.price < parseInt(min)) return false;
            }
        }
        
        return true;
    });

    // Sorting
    filtered.sort((a, b) => {
        // Always push sold items to the bottom
        if(a.status === 'sold' && b.status !== 'sold') return 1;
        if(b.status === 'sold' && a.status !== 'sold') return -1;

        if (sortFilter === 'price-low') return a.price - b.price;
        if (sortFilter === 'price-high') return b.price - a.price;
        return new Date(b.createdAt) - new Date(a.createdAt); // newest
    });

    // Update stats to match exact active filter criteria!
    const activeAvailable = filtered.filter(p => p.status === 'approved');
    const activeSellers = new Set(activeAvailable.map(p => {
        const s = findSeller(p.sellerId);
        return s ? s.id : p.sellerId;
    }));

    const statProductsEl = document.getElementById('statProducts');
    const statSellersEl = document.getElementById('statSellers');

    if (statProductsEl) statProductsEl.innerText = activeAvailable.length;
    if (statSellersEl) statSellersEl.innerText = activeSellers.size;

    // Update chip numbers for current filter
    updateCategoryChipCounts();

    renderMarketList(filtered);
}

function renderMarket() {
    updateCategoryChipCounts();
    filterProducts();
}

function renderMarketList(products) {
    const container = document.getElementById('marketProducts');

    if (products.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">store</span>
                <h3>ไม่พบสินค้า</h3>
                <p>ลองปรับตัวกรองการค้นหาใหม่</p>
            </div>
        `;
        return;
    }

    container.innerHTML = products.map(p => {
        const seller = findSeller(p.sellerId);
        const tableIdText = seller && seller.tableId ? seller.tableId : 'ยังไม่กำหนด';
        return `
            <div class="product-card" onclick="openDetailModal('${p.id}')">
                <div class="product-image">
                    <img src="${p.image}" alt="${p.name}" style="${p.status === 'sold' ? 'filter: grayscale(100%); opacity: 0.7;' : ''}">
                    ${p.status === 'sold' ? 
                        `<span class="product-badge badge-sold">ขายแล้ว</span>` : 
                        `<span class="product-badge badge-available">ว่าง</span>`
                    }
                </div>
                <div class="product-info">
                    <div class="product-title" style="${p.status === 'sold' ? 'color: var(--text-muted);' : ''}">${p.name} ${p.quantityType === 'multiple' ? `<small>(มี ${p.quantity} ชิ้น)</small>` : ''}</div>
                    <div class="product-price" style="${p.status === 'sold' ? 'color: var(--text-muted);' : ''}">
                        ฿${formatPrice(p.price)}
                        ${p.originalPrice ? `<span class="price-original-strikethrough">฿${formatPrice(p.originalPrice)}</span>` : ''}
                    </div>
                    <div class="product-meta">
                        <span class="material-icons-round">storefront</span> โต๊ะ ${tableIdText}
                        <span style="margin-left:auto">${getCategoryName(p.category).split(' ')[1]}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openDetailModal(productId) {
    const product = state.products.find(p => p.id === productId);
    const seller = product ? findSeller(product.sellerId) : null;
    
    if (!product) return;

    const tableIdText = seller && seller.tableId ? seller.tableId : 'ยังไม่กำหนดรหัสโต๊ะ';

    const body = document.getElementById('detailModalBody');
    body.innerHTML = `
        <div class="detail-layout">
            <div class="detail-image">
                <img src="${product.image}" alt="${product.name}" style="${product.status === 'sold' ? 'filter: grayscale(100%); opacity: 0.7;' : ''}">
            </div>
            <div class="detail-info">
                <h3 style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; ${product.status === 'sold' ? 'color: var(--text-muted);' : ''}">
                    <span>${product.name} ${product.quantityType === 'multiple' ? `<span style="font-size: 1rem; font-weight: normal; color: var(--text-secondary);">(มี ${product.quantity} ชิ้น)</span>` : ''}</span>
                    ${product.status === 'sold' ? `<span style="background: var(--danger); color: white; padding: 0.2rem 0.65rem; border-radius: var(--radius-full); font-weight: bold; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center;">ขายแล้ว</span>` : ''}
                </h3>
                <div class="detail-price" style="${product.status === 'sold' ? 'color: var(--text-muted);' : ''}">
                    ฿${formatPrice(product.price)}
                    ${product.originalPrice ? `<span class="price-original-strikethrough" style="font-size:1.1rem">฿${formatPrice(product.originalPrice)}</span>` : ''}
                </div>
                
                <div class="detail-section">
                    <h4>ประเภทสินค้า & วันที่วางขาย</h4>
                    <p>${getCategoryName(product.category)} | 📅 วันขาย: ${formatSellDates(product.sellDates)}</p>
                </div>
                
                <div class="detail-section">
                    <h4>ตำหนิ / สภาพ</h4>
                    <p>${product.defects || 'ไม่มี'}</p>
                </div>

                <div class="detail-section">
                    <h4>ข้อมูลผู้ขาย / ร้านค้า</h4>
                    <div class="seller-profile-card" onclick="${seller ? `openShopModal('${seller.id}')` : ''}">
                        ${seller && seller.image ? 
                            `<img src="${seller.image}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; flex-shrink:0;">` : 
                            `<div style="width:40px; height:40px; border-radius:50%; background:rgba(79,70,229,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                <span class="material-icons-round" style="font-size:22px;">storefront</span>
                            </div>`
                        }
                        <div class="seller-profile-info">
                            <strong>${seller ? (seller.shopName || ('ร้านของ ' + seller.name)) : 'ผู้ขาย'} (${seller ? seller.grade : '-'})</strong>
                            <span>เจ้าของร้าน: ${seller ? seller.name : '-'} | รหัสโต๊ะ: ${tableIdText}</span>
                        </div>
                        <span class="material-icons-round" style="margin-left:auto; color:var(--primary)">chevron_right</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
}

function openShopModal(sellerId) {
    closeDetailModal(); // Close current detail modal
    
    const seller = findSeller(sellerId);
    if(!seller) return;

    const tableIdText = seller.tableId ? seller.tableId : 'ยังไม่กำหนดรหัสโต๊ะ';
    const displayShopName = seller.shopName ? seller.shopName : `ร้านของ ${seller.name}`;
    document.getElementById('shopModalTitle').innerText = `${displayShopName} (โต๊ะ ${tableIdText})`;

    const sellerProducts = state.products.filter(p => {
        const s = findSeller(p.sellerId);
        return s && s.id === seller.id && (p.status === 'approved' || p.status === 'sold');
    });

    const body = document.getElementById('shopModalBody');
    
    if(sellerProducts.length === 0) {
        body.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">inventory_2</span>
                <h3>ยังไม่มีสินค้าที่ขายอยู่</h3>
            </div>
        `;
    } else {
        body.innerHTML = `
            <div class="products-grid">
                ${sellerProducts.map(p => `
                    <div class="product-card" onclick="openDetailModal('${p.id}')">
                        <div class="product-image">
                            <img src="${p.image}" alt="${p.name}" style="${p.status === 'sold' ? 'filter: grayscale(100%); opacity: 0.7;' : ''}">
                            ${p.status === 'sold' ? 
                                `<span class="product-badge badge-sold">ขายแล้ว</span>` : 
                                `<span class="product-badge badge-available">ว่าง</span>`
                            }
                        </div>
                        <div class="product-info">
                            <div class="product-title" style="${p.status === 'sold' ? 'color: var(--text-muted);' : ''}">${p.name}</div>
                            <div class="product-price" style="${p.status === 'sold' ? 'color: var(--text-muted);' : ''}">
                                ฿${formatPrice(p.price)}
                                ${p.originalPrice ? `<span class="price-original-strikethrough">฿${formatPrice(p.originalPrice)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    document.getElementById('shopModal').classList.add('active');
}

function closeShopModal() {
    document.getElementById('shopModal').classList.remove('active');
}

let tempEditSellerImage = '';
function previewEditSellerImage(input) {
    if (input.files && input.files[0]) {
        compressImage(input.files[0], (compressedDataUrl) => {
            tempEditSellerImage = compressedDataUrl;
            const label = document.getElementById('editSellerImageLabel');
            if (label) {
                label.innerText = 'เลือกรูปภาพแล้ว';
                label.style.color = 'var(--primary)';
            }
        });
    }
}

function saveSellerProfileSettings() {
    if (!state.currentUser || state.currentUser.role !== 'seller') return;

    const shopName = document.getElementById('editShopName').value.trim();
    const image = tempEditSellerImage || state.currentUser.image || '';

    state.currentUser.shopName = shopName;
    if (image) state.currentUser.image = image;

    const uIdx = state.users.findIndex(u => u.id === state.currentUser.id);
    if (uIdx > -1) {
        state.users[uIdx].shopName = shopName;
        if (image) state.users[uIdx].image = image;
    }

    saveLocalUser();
    saveAllLocalData();

    safeFirebaseSave('users/' + state.currentUser.id, {
        ...state.currentUser,
        shopName: shopName,
        image: state.currentUser.image || ''
    });

    showToast('อัปเดตข้อมูลร้านค้าเรียบร้อยแล้ว');
    openProfileModal();
    initApp();
    renderCurrentPage();
}

// --- Profile Modal & Logic ---

function openProfileModal() {
    if (!state.currentUser || state.currentUser.role === 'guest') return;

    document.getElementById('profileNameLarge').innerText = state.currentUser.name;
    
    let roleText = 'ผู้ขาย';
    if(state.currentUser.role === 'council') roleText = 'สภานักเรียน';
    document.getElementById('profileRoleLarge').innerText = roleText;

    const avatarIcon = document.getElementById('profileAvatarLarge');
    if (state.currentUser.role === 'seller' && state.currentUser.image) {
        avatarIcon.innerHTML = `<img src="${state.currentUser.image}" alt="Profile" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
        let iconName = state.currentUser.role === 'council' ? 'verified_user' : 'person';
        avatarIcon.innerHTML = `<span class="material-icons-round">${iconName}</span>`;
    }

    const sellerSettings = document.getElementById('sellerProfileSettings');
    if (state.currentUser.role === 'seller') {
        document.getElementById('profileTableBadge').style.display = 'inline-block';
        document.getElementById('profileTableIdText').innerText = state.currentUser.tableId || 'ยังไม่กำหนด';
        if (sellerSettings) {
            sellerSettings.style.display = 'block';
            document.getElementById('editShopName').value = state.currentUser.shopName || '';
        }
    } else {
        document.getElementById('profileTableBadge').style.display = 'none';
        if (sellerSettings) sellerSettings.style.display = 'none';
    }

    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';

    document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
}

function changePassword() {
    const oldPw = document.getElementById('oldPassword').value;
    const newPw = document.getElementById('newPassword').value;

    if (!oldPw || !newPw) {
        showToast('กรุณากรอกรหัสผ่านให้ครบ', 'error');
        return;
    }

    if (oldPw !== state.currentUser.password) {
        showToast('รหัสผ่านเดิมไม่ถูกต้อง', 'error');
        return;
    }

    state.currentUser.password = newPw;
    saveLocalUser();
    saveAllLocalData();
    
    safeFirebaseSave('users/' + state.currentUser.id + '/password', newPw);

    showToast('เปลี่ยนรหัสผ่านสำเร็จ');
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
}
