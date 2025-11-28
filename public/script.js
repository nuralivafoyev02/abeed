const tg = window.Telegram.WebApp;
tg.expand();

// Backend URL (Vercelga deploy qilgandan keyin o'zgaradi, hozircha relative path)
const API_URL = '/api'; 

let currentUser = null;

async function init() {
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        document.body.innerHTML = "<h1>Iltimos, bot orqali kiring.</h1>";
        return;
    }

    // 1. User ma'lumotlarini olish
    try {
        const res = await fetch(`${API_URL}/me?id=${userId}`);
        const user = await res.json();
        
        if (user.error) throw new Error(user.error);
        
        currentUser = user;
        renderUser(user);
        loadMenu();

        // Agar Admin yoki Boss bo'lsa
        if (['admin', 'boss'].includes(user.role)) {
            document.getElementById('adminPanel').classList.remove('hidden');
            loadUsers();
        }

    } catch (e) {
        alert(e.message);
    }
}

function renderUser(user) {
    document.getElementById('userName').innerText = user.full_name;
    document.getElementById('userBalance').innerText = parseFloat(user.balance).toLocaleString();
    document.getElementById('userRole').innerText = user.role.toUpperCase();
}

async function loadMenu() {
    const res = await fetch(`${API_URL}/menu`);
    const menu = await res.json();
    const container = document.getElementById('menuList');
    container.innerHTML = '';

    menu.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `
            <div>
                <b>${item.title}</b><br>
                <small>${parseInt(item.price).toLocaleString()} so'm</small>
            </div>
            <button class="btn-primary" style="width: auto;" onclick="orderFood(${item.id})">Buyurtma</button>
        `;
        container.appendChild(div);
    });
}

async function orderFood(menuId) {
    if(!confirm("Buyurtmani tasdiqlaysizmi?")) return;

    const res = await fetch(`${API_URL}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, menu_id: menuId })
    });

    const data = await res.json();
    if (data.error) {
        tg.showAlert(data.error);
    } else {
        tg.showAlert("Buyurtma qabul qilindi!");
        document.getElementById('userBalance').innerText = parseFloat(data.new_balance).toLocaleString();
    }
}

// ADMIN FUNCTIONS
async function addMenu() {
    const title = document.getElementById('newFoodName').value;
    const price = document.getElementById('newFoodPrice').value;

    await fetch(`${API_URL}/add-menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, title, price })
    });
    
    document.getElementById('newFoodName').value = '';
    document.getElementById('newFoodPrice').value = '';
    loadMenu();
    tg.showAlert("Taom qo'shildi");
}

async function loadUsers() {
    const res = await fetch(`${API_URL}/users?user_id=${currentUser.id}`);
    const users = await res.json();
    const container = document.getElementById('userList');
    container.innerHTML = '';

    users.forEach(u => {
        let adminBtn = '';
        if (currentUser.role === 'boss' && u.role === 'user') {
            adminBtn = `<button onclick="makeAdmin(${u.id})">Admin qilish</button>`;
        }

        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <b>${u.full_name}</b> (${u.role})<br>
            Balans: ${u.balance}
            <div class="actions">
                <input type="number" placeholder="Summa" id="bal-${u.id}" style="width: 80px;">
                <button onclick="addBalance(${u.id})">Pul qo'shish</button>
                ${adminBtn}
            </div>
        `;
        container.appendChild(div);
    });
}

async function addBalance(targetId) {
    const amount = document.getElementById(`bal-${targetId}`).value;
    await fetch(`${API_URL}/update-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: currentUser.id, target_id: targetId, amount })
    });
    tg.showAlert("Balans yangilandi");
    loadUsers();
}

async function makeAdmin(targetId) {
    if(!confirm("Bu xodimni Admin qilmoqchimisiz?")) return;
    
    await fetch(`${API_URL}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boss_id: currentUser.id, target_id: targetId })
    });
    tg.showAlert("Xodim Admin etib tayinlandi");
    loadUsers();
}

// Start
init();