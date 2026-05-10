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
const SPECIAL_CODE = "AAA";

let state = {
    currentUser: null, 
    users: [], 
    products: [], 
    currentCategory: 'all',
    currentCategoryCouncil: 'all',
    searchQuery: '',
    currentTab: 'pending' 
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('kusk_currentUser');
    if (savedUser) {
        state.currentUser = JSON.parse(savedUser);
    }
    
    // Listen for users
    db.ref('users').on('value', (snapshot) => {
        const data = snapshot.val();
        state.users = data ? Object.values(data) : [];
        if(state.currentUser && state.currentUser.role !== 'guest') {
            const updatedUser = state.users.find(u => u.id === state.currentUser.id);
            if(updatedUser) {
                state.currentUser = updatedUser;
                saveLocalUser();
            }
        }
    });

    // Listen for products
    db.ref('products').on('value', (snapshot) => {
        const data = snapshot.val();
        state.products = data ? Object.values(data) : [];
        renderCurrentPage();
    });

    if (state.currentUser) {
        initApp();
    } else {
        document.getElementById('authScreen').classList.add('active');
    }
});

function renderCurrentPage() {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;
    const pageId = activePage.id;
    if (pageId === 'marketPage') renderMarket();
    if (pageId === 'sellerPage') renderSellerProducts();
    if (pageId === 'councilPage') renderCouncilProducts();
}

function saveLocalUser() {
    if (state.currentUser) {
        localStorage.setItem('kusk_currentUser', JSON.stringify(state.currentUser));
    } else {
        localStorage.removeItem('kusk_currentUser');
    }
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
    selectRole('buyer'); // Default
}

function selectRole(role) {
    // Update active button
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.role-btn[data-role="${role}"]`).classList.add('active');

    // Show/hide specific fields
    const sellerFields = document.getElementById('sellerFields');
    const specialCodeField = document.getElementById('specialCodeField');

    sellerFields.style.display = role === 'seller' ? 'block' : 'none';
    specialCodeField.style.display = (role === 'seller' || role === 'council') ? 'block' : 'none';
}

let tempSellerImage = '';
function previewImage(input, labelId) {
    if (input.files && input.files[0]) {
        compressImage(input.files[0], (compressedDataUrl) => {
            tempSellerImage = compressedDataUrl;
            document.getElementById(labelId).innerText = 'เลือกรูปภาพแล้ว';
            document.getElementById(labelId).style.color = 'var(--primary)';
        });
    }
}

function handleRegister() {
    const role = document.querySelector('.role-btn.active').dataset.role;
    const name = document.getElementById('regName').value;
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;

    if (!name || !username || !password) {
        showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
        return;
    }

    // Check if username exists
    if (state.users.find(u => u.username === username)) {
        showToast('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว', 'error');
        return;
    }

    let newUser = {
        id: 'U' + Date.now(),
        name,
        username,
        password,
        role
    };

    if (role === 'seller' || role === 'council') {
        const code = document.getElementById('regSpecialCode').value;
        if (code !== SPECIAL_CODE) {
            showToast('รหัสเฉพาะไม่ถูกต้อง', 'error');
            return;
        }
    }

    if (role === 'seller') {
        const grade = document.getElementById('regGrade').value;
        if (!grade) {
            showToast('กรุณาเลือกระดับชั้น', 'error');
            return;
        }
        newUser.grade = grade;
        newUser.image = tempSellerImage || 'https://via.placeholder.com/150';
        
        // Generate Table ID
        const sellerCount = state.users.filter(u => u.role === 'seller').length;
        newUser.tableId = 'T-' + String(sellerCount + 1).padStart(2, '0');
    }

    // Save to Firebase
    db.ref('users/' + newUser.id).set(newUser).then(() => {
        showToast('ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ');
        showLogin();
    }).catch(err => {
        showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        console.error(err);
    });
}

function handleLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    const user = state.users.find(u => u.username === username && u.password === password);

    if (user) {
        state.currentUser = user;
        saveLocalUser();
        initApp();
        showToast('เข้าสู่ระบบสำเร็จ');
        if(user.role !== 'guest') closeProfileModal(); // fail-safe if left open
    } else {
        showToast('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'error');
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

// --- App Navigation & Setup ---

function initApp() {
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');

    // Setup Navigation
    const user = state.currentUser;
    if (user.role === 'guest') {
        document.getElementById('navUser').style.display = 'none'; // Guests don't need profile
    } else {
        document.getElementById('navUser').style.display = 'flex';
    }

    const navSeller = document.getElementById('navSeller');
    const navCouncil = document.getElementById('navCouncil');

    navSeller.style.display = 'none';
    navCouncil.style.display = 'none';

    if (user.role === 'seller') {
        navSeller.style.display = 'flex';
    } else if (user.role === 'council') {
        navCouncil.style.display = 'flex';
    }

    // Set Avatar
    const avatarIcon = document.getElementById('userAvatar');
    if (user.role === 'seller' && user.image) {
        avatarIcon.innerHTML = `<img src="${user.image}" alt="Profile">`;
    } else {
        let iconName = 'person';
        if(user.role === 'council') iconName = 'verified_user';
        avatarIcon.innerHTML = `<span class="material-icons-round">${iconName}</span>`;
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
    document.querySelector(`.nav-link[data-page="${pageId}"]`).classList.add('active');

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
    } else {
        icon.innerText = 'check_circle';
    }

    msg.innerText = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function formatPrice(price) {
    return new Intl.NumberFormat('th-TH').format(price);
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

// --- Product Management (Seller) ---

let tempProductImage = '';
function previewProductImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            tempProductImage = e.target.result;
            document.getElementById('productImagePreview').src = tempProductImage;
            document.getElementById('productImagePreview').style.display = 'block';
            document.getElementById('productImagePlaceholder').style.display = 'none';
        }
        reader.readAsDataURL(input.files[0]);
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
    document.getElementById('productPrice').value = '';
    document.getElementById('productDefects').value = '';
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
            document.getElementById('productPrice').value = product.price;
            document.getElementById('productDefects').value = product.defects || '';
            
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
    const id = document.getElementById('editProductId').value;
    const name = document.getElementById('productName').value;
    const category = document.getElementById('productCategory').value;
    const price = parseInt(document.getElementById('productPrice').value);
    const defects = document.getElementById('productDefects').value;
    const quantityType = document.querySelector('input[name="productQuantityType"]:checked').value;
    const quantity = quantityType === 'multiple' ? parseInt(document.getElementById('productQuantity').value) : 1;

    if (!tempProductImage || !name || !category || isNaN(price) || (quantityType === 'multiple' && (isNaN(quantity) || quantity < 1))) {
        showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วนและใส่รูปภาพ', 'error');
        return;
    }

    let productData;
    if (id) {
        // Edit existing
        const index = state.products.findIndex(p => p.id === id);
        if (index > -1) {
            productData = {
                ...state.products[index],
                name, category, price, defects, quantityType, quantity,
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
            sellerId: state.currentUser.id,
            name, category, price, defects, quantityType, quantity,
            image: tempProductImage,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
    }

    if (productData) {
        db.ref('products/' + productData.id).set(productData).then(() => {
            showToast(id ? 'อัปเดตสินค้าและส่งตรวจสอบแล้ว' : 'เพิ่มสินค้าและส่งตรวจสอบแล้ว');
            closeProductModal();
        }).catch(err => {
            showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
            console.error(err);
        });
    }
}

function markAsSold(productId) {
    if(confirm('ยืนยันว่าสินค้านี้ขายออกแล้วใช่หรือไม่?')) {
        const product = state.products.find(p => p.id === productId);
        if (product) {
            db.ref('products/' + product.id).update({ status: 'sold' }).then(() => {
                showToast('ทำเครื่องหมายว่าขายแล้ว');
            });
        }
    }
}

function undoSold(productId) {
    if(confirm('ต้องการยกเลิกสถานะขายแล้ว และนำกลับมาขายใหม่ใช่หรือไม่?')) {
        const product = state.products.find(p => p.id === productId);
        if (product) {
            db.ref('products/' + product.id).update({ status: 'approved' }).then(() => {
                showToast('นำสินค้ากลับมาขายใหม่แล้ว');
            });
        }
    }
}

function renderSellerProducts() {
    const container = document.getElementById('sellerProducts');
    const myProducts = state.products.filter(p => p.sellerId === state.currentUser.id);
    
    // Update Dashboard Stats
    document.getElementById('sStatTotal').innerText = myProducts.length;
    document.getElementById('sStatPending').innerText = myProducts.filter(p => p.status === 'pending').length;
    document.getElementById('sStatRevision').innerText = myProducts.filter(p => p.status === 'revision').length;
    document.getElementById('sStatSelling').innerText = myProducts.filter(p => p.status === 'approved').length;
    document.getElementById('sStatSold').innerText = myProducts.filter(p => p.status === 'sold').length;

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
                <div class="list-item-price">฿${formatPrice(p.price)}</div>
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
            </div>
        </div>
    `).join('');
}


// --- Council Review ---

function switchCouncilTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.council-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.council-tabs .tab[data-tab="${tab}"]`).classList.add('active');
    renderCouncilProducts();
}

function renderCouncilProducts() {
    const container = document.getElementById('councilProducts');
    
    // Update Stats
    const pendingCount = state.products.filter(p => p.status === 'pending').length;
    const approvedCount = state.products.filter(p => p.status === 'approved' || p.status === 'sold').length;
    
    document.getElementById('statPending').innerText = pendingCount;
    document.getElementById('statApproved').innerText = approvedCount;
    document.getElementById('pendingBadge').innerText = pendingCount;
    document.getElementById('pendingBadge').style.display = pendingCount > 0 ? 'inline-block' : 'none';

    let productsToShow = state.products.filter(p => p.status === state.currentTab);
    
    if (state.currentCategoryCouncil !== 'all') {
        productsToShow = productsToShow.filter(p => p.category === state.currentCategoryCouncil);
    }

    if (productsToShow.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">fact_check</span>
                <h3>ไม่มีสินค้าในหมวดหมู่นี้</h3>
            </div>
        `;
        return;
    }

    container.innerHTML = productsToShow.map(p => {
        const seller = state.users.find(u => u.id === p.sellerId);
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
                    <div class="product-price">฿${formatPrice(p.price)}</div>
                    <div class="product-meta">
                        <span class="material-icons-round">storefront</span> โต๊ะ ${seller ? seller.tableId : '-'}
                        <span style="margin-left:auto">${getCategoryName(p.category).split(' ')[1]}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openReviewModal(productId) {
    const product = state.products.find(p => p.id === productId);
    const seller = state.users.find(u => u.id === product.sellerId);
    
    if (!product) return;

    document.getElementById('reviewProductId').value = productId;
    
    const body = document.getElementById('reviewModalBody');
    body.innerHTML = `
        <div class="detail-layout">
            <div class="detail-image">
                <img src="${product.image}" alt="${product.name}">
            </div>
            <div class="detail-info">
                <h3>${product.name}</h3>
                <div class="detail-price">฿${formatPrice(product.price)}</div>
                
                <div class="detail-section">
                    <h4>ประเภท</h4>
                    <p>${getCategoryName(product.category)}</p>
                </div>
                
                <div class="detail-section">
                    <h4>ตำหนิ / สภาพ</h4>
                    <p>${product.defects}</p>
                </div>

                <div class="seller-profile-card">
                    <img src="${seller.image || 'https://via.placeholder.com/50'}" alt="Seller">
                    <div class="seller-profile-info">
                        <strong>ผู้ขาย: ${seller.name} (${seller.grade})</strong>
                        <span>รหัสโต๊ะ: ${seller.tableId}</span>
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
        db.ref('products/' + product.id).update({ status: 'revision', revisionNote: note }).then(() => {
            showToast('ส่งกลับให้ผู้ขายแก้ไขแล้ว', 'warning');
            closeReviewModal();
        });
    }
}

function approveProduct() {
    const id = document.getElementById('reviewProductId').value;
    const product = state.products.find(p => p.id === id);
    
    if (product) {
        db.ref('products/' + product.id).update({ status: 'approved', revisionNote: null }).then(() => {
            showToast('อนุมัติสินค้าสำเร็จ สินค้าขึ้นตลาดแล้ว');
            closeReviewModal();
        });
    }
}

function cancelApproval() {
    if(confirm('ต้องการยกเลิกการอนุมัติสินค้านี้ใช่หรือไม่? (สินค้าจะกลับไปรอตรวจสอบใหม่)')) {
        const id = document.getElementById('reviewProductId').value;
        const product = state.products.find(p => p.id === id);
        
        if (product) {
            db.ref('products/' + product.id).update({ status: 'pending' }).then(() => {
                showToast('ยกเลิกอนุมัติสินค้าแล้ว');
                closeReviewModal();
            });
        }
    }
}


// --- Market Page ---

function filterByCategory(category, pageContext = 'market') {
    if (pageContext === 'market') {
        state.currentCategory = category;
        document.querySelectorAll('.filters-bar .chip').forEach(c => c.classList.remove('active'));
        document.querySelector(`.filters-bar .chip[data-category="${category}"]`).classList.add('active');
        filterProducts();
    } else if (pageContext === 'council') {
        state.currentCategoryCouncil = category;
        document.querySelectorAll('.council-filters .chip').forEach(c => c.classList.remove('active'));
        document.querySelector(`.council-filters .chip[data-category="${category}"]`).classList.add('active');
        renderCouncilProducts();
    }
}

function filterProducts() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const priceFilter = document.getElementById('priceFilter').value;
    const sortFilter = document.getElementById('sortFilter').value;

    let filtered = state.products.filter(p => {
        // Only show approved or sold in market
        if (p.status !== 'approved' && p.status !== 'sold') return false;
        
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
                if (p.price < parseInt(min)) return false; // 500+
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

    renderMarketList(filtered);
}

function renderMarket() {
    // Update Stats
    const approvedProducts = state.products.filter(p => p.status === 'approved' || p.status === 'sold');
    document.getElementById('statProducts').innerText = approvedProducts.length;
    
    const uniqueSellers = new Set(approvedProducts.map(p => p.sellerId));
    document.getElementById('statSellers').innerText = uniqueSellers.size;

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
        const seller = state.users.find(u => u.id === p.sellerId);
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
                    <div class="product-title" style="${p.status === 'sold' ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${p.name} ${p.quantityType === 'multiple' ? `<small>(มี ${p.quantity} ชิ้น)</small>` : ''}</div>
                    <div class="product-price" style="${p.status === 'sold' ? 'color: var(--text-muted);' : ''}">฿${formatPrice(p.price)}</div>
                    <div class="product-meta">
                        <span class="material-icons-round">storefront</span> โต๊ะ ${seller ? seller.tableId : '-'}
                        <span style="margin-left:auto">${getCategoryName(p.category).split(' ')[1]}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openDetailModal(productId) {
    const product = state.products.find(p => p.id === productId);
    const seller = state.users.find(u => u.id === product.sellerId);
    
    if (!product) return;

    const body = document.getElementById('detailModalBody');
    body.innerHTML = `
        <div class="detail-layout">
            <div class="detail-image">
                <img src="${product.image}" alt="${product.name}" style="${product.status === 'sold' ? 'filter: grayscale(100%); opacity: 0.7;' : ''}">
                 ${product.status === 'sold' ? 
                    `<div style="position: absolute; top: 1rem; right: 1rem; background: var(--danger); color: white; padding: 0.5rem 1rem; border-radius: var(--radius-full); font-weight: bold; font-size: 1.2rem;">ขายแล้ว</div>` : ''
                }
            </div>
            <div class="detail-info">
                <h3 style="${product.status === 'sold' ? 'text-decoration: line-through;' : ''}">${product.name} ${product.quantityType === 'multiple' ? `<span style="font-size: 1rem; font-weight: normal; color: var(--text-secondary);">(มี ${product.quantity} ชิ้น)</span>` : ''}</h3>
                <div class="detail-price" style="${product.status === 'sold' ? 'color: var(--text-muted);' : ''}">฿${formatPrice(product.price)}</div>
                
                <div class="detail-section">
                    <h4>ประเภท</h4>
                    <p>${getCategoryName(product.category)}</p>
                </div>
                
                <div class="detail-section">
                    <h4>ตำหนิ / สภาพ</h4>
                    <p>${product.defects}</p>
                </div>

                <div class="detail-section">
                    <h4>ข้อมูลผู้ขาย</h4>
                    <div class="seller-profile-card" onclick="openShopModal('${seller.id}')">
                        <img src="${seller.image || 'https://via.placeholder.com/50'}" alt="Seller">
                        <div class="seller-profile-info">
                            <strong>${seller.name} (${seller.grade})</strong>
                            <span>รหัสโต๊ะ: ${seller.tableId}</span>
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
    
    const seller = state.users.find(u => u.id === sellerId);
    if(!seller) return;

    document.getElementById('shopModalTitle').innerText = `ร้านค้าของ ${seller.name} (โต๊ะ ${seller.tableId})`;

    const sellerProducts = state.products.filter(p => p.sellerId === sellerId && (p.status === 'approved' || p.status === 'sold'));

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
                            <div class="product-title" style="${p.status === 'sold' ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${p.name}</div>
                            <div class="product-price" style="${p.status === 'sold' ? 'color: var(--text-muted);' : ''}">฿${formatPrice(p.price)}</div>
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

// --- Profile Modal & Logic ---

function openProfileModal() {
    if (!state.currentUser || state.currentUser.role === 'guest') return;

    document.getElementById('profileNameLarge').innerText = state.currentUser.name;
    
    let roleText = 'ผู้ขาย';
    if(state.currentUser.role === 'council') roleText = 'สภานักเรียน';
    document.getElementById('profileRoleLarge').innerText = roleText;

    const avatarIcon = document.getElementById('profileAvatarLarge');
    if (state.currentUser.role === 'seller' && state.currentUser.image) {
        avatarIcon.innerHTML = `<img src="${state.currentUser.image}" alt="Profile">`;
    } else {
        let iconName = state.currentUser.role === 'council' ? 'verified_user' : 'person';
        avatarIcon.innerHTML = `<span class="material-icons-round">${iconName}</span>`;
    }

    if (state.currentUser.role === 'seller') {
        document.getElementById('profileTableBadge').style.display = 'inline-block';
        document.getElementById('profileTableIdText').innerText = state.currentUser.tableId;
    } else {
        document.getElementById('profileTableBadge').style.display = 'none';
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
    
    db.ref('users/' + state.currentUser.id).update({ password: newPw }).then(() => {
        showToast('เปลี่ยนรหัสผ่านสำเร็จ');
        document.getElementById('oldPassword').value = '';
        document.getElementById('newPassword').value = '';
    });
}
