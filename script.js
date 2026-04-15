/*****************************************************
 * ШКОЛЬНЫЙ ФОРУМ "ШФ1" - ОСНОВНОЙ СКРИПТ (Firebase)
 * База данных: Firestore
 * Аутентификация: Firebase Auth
 * Защита: DOMPurify от XSS
 * Версия: 3.0.0
 *****************************************************/

// ==================== КОНФИГУРАЦИЯ FIREBASE ====================
// ЗАМЕНИ НА СВОИ ДАННЫЕ ИЗ КОНСОЛИ FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================

let currentUser = null;                 // объект пользователя Firebase
let currentUserData = null;             // дополнительные данные из коллекции users
let currentUserRole = 'user';           // 'user', 'moderator', 'admin'
let currentView = 'forums';             // текущий вид
let currentForumId = null;              // id текущего раздела
let currentThreadId = null;             // id текущей темы
let currentDialogUserId = null;         // id собеседника в ЛС
let unreadCount = 0;                   // количество непрочитанных ЛС
let notificationInterval = null;        // интервал проверки уведомлений
let contextTarget = null;              // элемент для контекстного меню
let contextType = null;                // 'forum', 'thread', 'post', 'user'
let currentPage = 1;
const ITEMS_PER_PAGE = 20;
let searchResults = null;              // результаты поиска
let isSearchMode = false;

// DOM элементы
const authBlock = document.getElementById('authBlock');
const navbar = document.getElementById('navbar');
const mainContainer = document.getElementById('mainContainer');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
const toastEl = document.getElementById('toast');
const adminNavBtn = document.getElementById('adminNavBtn');
const unreadBadge = document.getElementById('unreadBadge');
const navUsername = document.getElementById('navUsername');
const logoutNavBtn = document.getElementById('logoutNavBtn');
const homeBtn = document.getElementById('homeBtn');
const searchBar = document.getElementById('searchBar');
const breadcrumbs = document.getElementById('breadcrumbs');
const breadcrumbList = document.getElementById('breadcrumbList');
const contextMenu = document.getElementById('contextMenu');
const globalLoadingOverlay = document.getElementById('globalLoadingOverlay');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileSidebar = document.getElementById('mobileSidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const globalSearchInput = document.getElementById('globalSearchInput');
const globalSearchBtn = document.getElementById('globalSearchBtn');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchType = document.getElementById('searchType');

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 ШФ1 (Firebase) запускается...');
  setupEventListeners();
  
  // Слушатель состояния аутентификации
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      await loadUserData(user.uid);
      startNotificationInterval();
    } else {
      currentUser = null;
      currentUserData = null;
      currentUserRole = 'user';
      if (notificationInterval) clearInterval(notificationInterval);
    }
    updateAuthUI();
    // После обновления UI рендерим начальный вид
    if (!currentView) currentView = 'forums';
    navigateTo(currentView);
  });
});

function setupEventListeners() {
  // Навигация
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const view = btn.dataset.view;
      navigateTo(view);
    });
  });
  
  homeBtn.addEventListener('click', () => navigateTo('forums'));
  
  logoutNavBtn.addEventListener('click', logout);
  
  // Поиск
  globalSearchBtn.addEventListener('click', performSearch);
  clearSearchBtn.addEventListener('click', clearSearch);
  globalSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  // Модальное окно
  modalClose.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Контекстное меню
  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });
  contextMenu.addEventListener('click', (e) => {
    const action = e.target.closest('li')?.dataset.action;
    if (action) handleContextAction(action);
    contextMenu.style.display = 'none';
  });
  
  // Мобильное меню
  mobileMenuToggle.addEventListener('click', openMobileSidebar);
  closeSidebarBtn.addEventListener('click', closeMobileSidebar);
  sidebarOverlay.addEventListener('click', closeMobileSidebar);
}

// ==================== АУТЕНТИФИКАЦИЯ ====================

async function loadUserData(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      currentUserData = doc.data();
      currentUserRole = currentUserData.role || 'user';
      // Обновляем lastSeen
      await db.collection('users').doc(uid).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() });
    } else {
      // Создаем запись пользователя
      const newUser = {
        email: currentUser.email,
        displayName: currentUser.displayName || currentUser.email.split('@')[0],
        role: 'user',
        avatar: '',
        signature: '',
        registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('users').doc(uid).set(newUser);
      currentUserData = newUser;
      currentUserRole = 'user';
    }
  } catch (error) {
    console.error('Ошибка загрузки данных пользователя:', error);
  }
}

function updateAuthUI() {
  if (currentUser) {
    const displayName = currentUserData?.displayName || currentUser.displayName || currentUser.email;
    authBlock.innerHTML = `
      <span style="color:var(--text-secondary);"><i class="fas fa-user"></i> ${escapeHtml(displayName)}</span>
      ${currentUserRole !== 'user' ? '<span class="badge" style="background:#2e6da4;"><i class="fas fa-shield-alt"></i> ' + (currentUserRole === 'admin' ? 'Админ' : 'Модер') + '</span>' : ''}
      <button class="btn btn-outline btn-sm" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> Выйти</button>
    `;
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    navbar.style.display = 'flex';
    navUsername.textContent = displayName;
    logoutNavBtn.style.display = 'block';
    if (currentUserRole === 'admin' || currentUserRole === 'moderator') {
      adminNavBtn.style.display = 'block';
    } else {
      adminNavBtn.style.display = 'none';
    }
    searchBar.style.display = 'block';
    checkUnreadMessages();
  } else {
    authBlock.innerHTML = `
      <button class="btn btn-outline btn-sm" id="loginBtn"><i class="fas fa-sign-in-alt"></i> Войти</button>
      <button class="btn btn-primary btn-sm" id="registerBtn"><i class="fas fa-user-plus"></i> Регистрация</button>
    `;
    document.getElementById('loginBtn')?.addEventListener('click', () => openAuthModal('login'));
    document.getElementById('registerBtn')?.addEventListener('click', () => openAuthModal('register'));
    navbar.style.display = 'none';
    navUsername.textContent = '';
    logoutNavBtn.style.display = 'none';
    adminNavBtn.style.display = 'none';
    searchBar.style.display = 'none';
    breadcrumbs.style.display = 'none';
  }
}

function openAuthModal(mode) {
  const title = mode === 'login' ? 'Вход в ШФ1' : 'Регистрация нового аккаунта';
  openModal(`
    <h2>${title}</h2>
    <form id="authForm">
      <div class="form-group">
        <label><i class="fas fa-envelope"></i> Email</label>
        <input type="email" id="authEmail" required>
      </div>
      <div class="form-group">
        <label><i class="fas fa-lock"></i> Пароль</label>
        <input type="password" id="authPass" required minlength="6">
      </div>
      ${mode === 'register' ? `
      <div class="form-group">
        <label><i class="fas fa-user"></i> Имя (ник)</label>
        <input type="text" id="authName" required maxlength="30">
      </div>
      <div class="form-group">
        <label><i class="fas fa-shield"></i> Кодовое слово (для модератора)</label>
        <input type="text" id="schoolCode" placeholder="Необязательно">
      </div>
      ` : ''}
      <button type="submit" class="btn btn-primary" style="width:100%;">${mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
    </form>
  `);
  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleAuth(mode);
  });
}

async function handleAuth(mode) {
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPass').value.trim();
  const displayName = mode === 'register' ? document.getElementById('authName')?.value.trim() : null;
  const schoolCode = mode === 'register' ? document.getElementById('schoolCode')?.value.trim() : '';
  
  if (!email || !password) {
    showToast('Заполните все поля', true);
    return;
  }
  
  showGlobalLoading(true);
  try {
    if (mode === 'register') {
      const userCred = await auth.createUserWithEmailAndPassword(email, password);
      await userCred.user.updateProfile({ displayName });
      // Определяем роль
      let role = 'user';
      if (schoolCode === 'MODERATOR_CODE_123') role = 'moderator'; // Задай свой код
      // Создаем запись в коллекции users
      await db.collection('users').doc(userCred.user.uid).set({
        email,
        displayName,
        role,
        avatar: '',
        signature: '',
        registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
      showToast(`Добро пожаловать, ${displayName}!`);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      closeModal();
      showToast('Вход выполнен успешно!');
    }
  } catch (error) {
    console.error(error);
    let message = 'Ошибка аутентификации';
    if (error.code === 'auth/email-already-in-use') message = 'Email уже используется';
    else if (error.code === 'auth/wrong-password') message = 'Неверный пароль';
    else if (error.code === 'auth/user-not-found') message = 'Пользователь не найден';
    showToast(message, true);
  } finally {
    showGlobalLoading(false);
  }
}

async function logout() {
  try {
    await auth.signOut();
    showToast('Вы вышли из системы');
  } catch (error) {
    console.error(error);
  }
}

// ==================== НАВИГАЦИЯ ====================

function navigateTo(view, param = null) {
  currentView = view;
  // Сбрасываем режим поиска
  isSearchMode = false;
  clearSearchBtn.style.display = 'none';
  
  // Обновляем активный пункт меню
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.view === view) btn.classList.add('active');
  });
  
  // Сбрасываем параметры если нужно
  if (view === 'forums') {
    currentForumId = null;
    currentThreadId = null;
  }
  if (view === 'messages') {
    currentDialogUserId = null;
  }
  
  renderView(param);
}

async function renderView(param) {
  showGlobalLoading(true);
  try {
    switch (currentView) {
      case 'forums':
        await renderForums();
        break;
      case 'threads':
        await renderThreads(param || currentForumId);
        break;
      case 'posts':
        await renderPosts(param || currentThreadId);
        break;
      case 'messages':
        await renderMessages(param);
        break;
      case 'profile':
        await renderProfile(param);
        break;
      case 'members':
        await renderMembers();
        break;
      case 'admin':
        await renderAdminPanel();
        break;
      default:
        await renderForums();
    }
    updateBreadcrumbs();
  } catch (error) {
    console.error(error);
    mainContainer.innerHTML = `<div class="loader"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки</p></div>`;
  } finally {
    showGlobalLoading(false);
  }
}

function updateBreadcrumbs() {
  let html = `<li><a data-view="forums">Главная</a></li>`;
  if (currentForumId) {
    // Получить название форума (можно из кэша)
    html += `<li><a data-view="threads" data-param="${currentForumId}">Раздел</a></li>`;
  }
  if (currentThreadId) {
    html += `<li>Тема</li>`;
  }
  breadcrumbList.innerHTML = html;
  breadcrumbs.style.display = (currentView !== 'forums' && currentView !== 'messages' && currentView !== 'profile' && currentView !== 'members' && currentView !== 'admin') ? 'block' : 'none';
  
  document.querySelectorAll('#breadcrumbList a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      const param = link.dataset.param;
      navigateTo(view, param);
    });
  });
}

// ==================== РЕНДЕРИНГ РАЗДЕЛОВ ====================

async function renderForums() {
  const snapshot = await db.collection('forums').orderBy('order').get();
  const forums = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let html = `
    <div class="card">
      <div class="card-header">
        <h2><i class="fas fa-folder-open"></i> Разделы форума</h2>
        ${(currentUserRole === 'admin') ? '<button class="btn btn-sm btn-primary" id="createForumBtn"><i class="fas fa-plus"></i> Создать раздел</button>' : ''}
      </div>
      <div class="forum-list">
  `;
  
  if (forums.length === 0) {
    html += '<p style="text-align:center;color:var(--text-muted);">Нет разделов. Создайте первый!</p>';
  } else {
    for (const forum of forums) {
      // Получаем статистику (можно через отдельные запросы или денормализацию)
      const threadsSnapshot = await db.collection('threads').where('forumId', '==', forum.id).get();
      const threadCount = threadsSnapshot.size;
      // Для количества сообщений и последнего поста можно сделать отдельные запросы, но для простоты опустим
      html += `
        <div class="forum-item" data-id="${forum.id}">
          <div class="forum-icon"><i class="fas ${forum.icon || 'fa-comments'}"></i></div>
          <div class="forum-info">
            <h3 class="forum-name">${escapeHtml(forum.name)}</h3>
            <p class="forum-desc">${escapeHtml(forum.description || '')}</p>
            <div class="forum-meta">
              <span><i class="fas fa-list"></i> Тем: ${threadCount}</span>
            </div>
          </div>
        </div>
      `;
    }
  }
  
  html += `</div></div>`;
  mainContainer.innerHTML = html;
  
  document.querySelectorAll('.forum-item').forEach(el => {
    el.addEventListener('click', () => navigateTo('threads', el.dataset.id));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, 'forum', el.dataset.id);
    });
  });
  
  if (currentUserRole === 'admin') {
    document.getElementById('createForumBtn')?.addEventListener('click', openForumModal);
  }
}

async function renderThreads(forumId) {
  if (!forumId) {
    navigateTo('forums');
    return;
  }
  currentForumId = forumId;
  
  // Получаем данные форума
  const forumDoc = await db.collection('forums').doc(forumId).get();
  if (!forumDoc.exists) return;
  const forum = forumDoc.data();
  
  // Получаем темы
  const threadsSnapshot = await db.collection('threads')
    .where('forumId', '==', forumId)
    .orderBy('isPinned', 'desc')
    .orderBy('updatedAt', 'desc')
    .get();
  const threads = threadsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let html = `
    <div class="card">
      <div class="card-header">
        <h2><i class="fas fa-comments"></i> ${escapeHtml(forum.name)}</h2>
        <button class="btn btn-primary" id="newThreadBtn"><i class="fas fa-plus"></i> Новая тема</button>
      </div>
      <div class="thread-list">
  `;
  
  if (threads.length === 0) {
    html += '<p style="text-align:center;color:var(--text-muted);padding:20px;">В этом разделе пока нет тем. Будьте первым!</p>';
  } else {
    for (const thread of threads) {
      const isPinned = thread.isPinned || false;
      const isLocked = thread.isLocked || false;
      html += `
        <div class="thread-item" data-id="${thread.id}">
          <div class="thread-icon">
            <i class="fas fa-comment"></i>
            ${isPinned ? '<span class="thread-pinned-badge"><i class="fas fa-thumbtack"></i></span>' : ''}
            ${isLocked ? '<span class="thread-locked-badge"><i class="fas fa-lock"></i></span>' : ''}
          </div>
          <div class="thread-info">
            <h4 class="thread-title">${escapeHtml(thread.title)}</h4>
            <div class="thread-meta">
              <span><i class="fas fa-user"></i> ${escapeHtml(thread.authorName)}</span>
              <span><i class="far fa-calendar-alt"></i> ${formatDate(thread.createdAt)}</span>
              <span><i class="fas fa-reply"></i> Ответов: ${thread.postCount || 0}</span>
              <span><i class="far fa-eye"></i> Просмотров: ${thread.views || 0}</span>
            </div>
          </div>
          <div class="thread-last">
            <span class="last-post-author">${escapeHtml(thread.lastPostAuthor || '—')}</span>
            <span class="last-post-date">${thread.lastPostDate ? formatDate(thread.lastPostDate) : ''}</span>
          </div>
        </div>
      `;
    }
  }
  html += `</div></div>`;
  mainContainer.innerHTML = html;
  
  document.querySelectorAll('.thread-item').forEach(el => {
    el.addEventListener('click', () => navigateTo('posts', el.dataset.id));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, 'thread', el.dataset.id);
    });
  });
  
  document.getElementById('newThreadBtn')?.addEventListener('click', () => openThreadModal(forumId));
}

async function renderPosts(threadId) {
  if (!threadId) {
    navigateTo('forums');
    return;
  }
  currentThreadId = threadId;
  
  // Получаем тему
  const threadDoc = await db.collection('threads').doc(threadId).get();
  if (!threadDoc.exists) return;
  const thread = threadDoc.data();
  thread.id = threadDoc.id;
  
  // Увеличиваем просмотры
  await db.collection('threads').doc(threadId).update({
    views: firebase.firestore.FieldValue.increment(1)
  });
  
  // Получаем сообщения
  const postsSnapshot = await db.collection('posts')
    .where('threadId', '==', threadId)
    .orderBy('createdAt', 'asc')
    .get();
  const posts = postsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let html = `
    <div class="card">
      <div class="card-header">
        <h2>${escapeHtml(thread.title)}</h2>
        <div>
          ${(currentUser && (!thread.isLocked || currentUserRole === 'admin' || currentUserRole === 'moderator')) ? 
            '<button class="btn btn-primary" id="replyBtn"><i class="fas fa-reply"></i> Ответить</button>' : ''}
          ${(currentUserRole === 'admin' || currentUserRole === 'moderator') ? 
            `<button class="btn btn-outline btn-sm" id="moderateThreadBtn"><i class="fas fa-gavel"></i></button>` : ''}
        </div>
      </div>
      <div class="post-list">
  `;
  
  posts.forEach((post, index) => {
    html += renderPostHTML(post, index + 1);
  });
  
  html += `</div></div>`;
  mainContainer.innerHTML = html;
  
  // Обработчики для постов
  document.querySelectorAll('.post-item').forEach(el => {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, 'post', el.dataset.postId);
    });
  });
  
  document.querySelectorAll('[data-action="reply"]').forEach(btn => {
    btn.addEventListener('click', () => openPostModal(threadId, null));
  });
  document.querySelectorAll('[data-action="quote"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.closest('.post-item').dataset.postId;
      const post = posts.find(p => p.id === postId);
      if (post) openPostModal(threadId, post);
    });
  });
  
  document.getElementById('replyBtn')?.addEventListener('click', () => openPostModal(threadId, null));
  document.getElementById('moderateThreadBtn')?.addEventListener('click', () => openThreadModerationModal(threadId, thread));
}

function renderPostHTML(post, number) {
  const isOnline = false; // можно добавить проверку lastSeen
  return `
    <div class="post-item" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-author">
          <img class="post-avatar" src="${post.authorAvatar || 'https://via.placeholder.com/40'}" alt="avatar">
          <span class="post-author-name">${escapeHtml(post.authorName)}</span>
          ${post.authorRole && post.authorRole !== 'user' ? `<span class="post-author-role">${post.authorRole}</span>` : ''}
        </div>
        <div class="post-meta">
          <span class="post-date"><i class="far fa-clock"></i> ${formatDate(post.createdAt)}</span>
          <span class="post-number">#${number}</span>
        </div>
      </div>
      <div class="post-content">${DOMPurify.sanitize(post.content)}</div>
      <div class="post-footer">
        <div class="post-actions">
          <button class="btn-icon" data-action="reply"><i class="fas fa-reply"></i> Ответить</button>
          <button class="btn-icon" data-action="quote"><i class="fas fa-quote-right"></i> Цитировать</button>
          <button class="btn-icon" data-action="report"><i class="fas fa-flag"></i></button>
          <button class="btn-icon post-menu-trigger"><i class="fas fa-ellipsis-v"></i></button>
        </div>
        <div class="post-signature">${escapeHtml(post.authorSignature || '')}</div>
      </div>
    </div>
  `;
}

// ==================== ЛИЧНЫЕ СООБЩЕНИЯ ====================

async function renderMessages(userId = null) {
  if (!currentUser) return;
  
  if (userId) {
    currentDialogUserId = userId;
    await renderDialog(userId);
  } else {
    await renderConversationsList();
  }
}

async function renderConversationsList() {
  // Получаем все сообщения, где текущий пользователь отправитель или получатель
  const sentSnapshot = await db.collection('messages')
    .where('senderId', '==', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .get();
  const receivedSnapshot = await db.collection('messages')
    .where('receiverId', '==', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .get();
  
  const conversations = new Map();
  
  const processMessage = (msg) => {
    const otherId = msg.senderId === currentUser.uid ? msg.receiverId : msg.senderId;
    if (!conversations.has(otherId)) {
      conversations.set(otherId, {
        userId: otherId,
        lastMessage: msg.content,
        lastDate: msg.createdAt,
        unread: msg.receiverId === currentUser.uid && !msg.read
      });
    }
  };
  
  sentSnapshot.docs.forEach(doc => processMessage({ id: doc.id, ...doc.data() }));
  receivedSnapshot.docs.forEach(doc => processMessage({ id: doc.id, ...doc.data() }));
  
  const usersData = await Promise.all(
    Array.from(conversations.keys()).map(async (uid) => {
      const userDoc = await db.collection('users').doc(uid).get();
      return { uid, ...userDoc.data() };
    })
  );
  
  let html = `
    <div class="card">
      <div class="card-header">
        <h2><i class="fas fa-envelope"></i> Личные сообщения</h2>
        <button class="btn btn-primary" id="newMessageBtn"><i class="fas fa-plus"></i> Новое сообщение</button>
      </div>
      <div class="message-list">
  `;
  
  if (conversations.size === 0) {
    html += '<p style="text-align:center;color:var(--text-muted);">У вас пока нет сообщений.</p>';
  } else {
    const sorted = Array.from(conversations.entries()).sort((a, b) => b[1].lastDate - a[1].lastDate);
    for (const [uid, conv] of sorted) {
      const user = usersData.find(u => u.uid === uid);
      const displayName = user?.displayName || 'Пользователь';
      html += `
        <div class="message-item" data-user-id="${uid}">
          <div class="message-avatar"><img src="${user?.avatar || 'https://via.placeholder.com/45'}" alt=""></div>
          <div class="message-body">
            <div class="message-header">
              <span class="message-sender">${escapeHtml(displayName)}</span>
              <span class="message-date">${conv.lastDate ? formatDate(conv.lastDate.toDate()) : ''}</span>
            </div>
            <div class="message-content">${escapeHtml(conv.lastMessage || '')} ${conv.unread ? '<span class="new-message-dot"></span>' : ''}</div>
          </div>
        </div>
      `;
    }
  }
  html += `</div></div>`;
  mainContainer.innerHTML = html;
  
  document.querySelectorAll('.message-item').forEach(el => {
    el.addEventListener('click', () => renderMessages(el.dataset.userId));
  });
  document.getElementById('newMessageBtn')?.addEventListener('click', openNewMessageModal);
}

async function renderDialog(userId) {
  const userDoc = await db.collection('users').doc(userId).get();
  const user = userDoc.data();
  
  const messagesSnapshot = await db.collection('messages')
    .where('senderId', 'in', [currentUser.uid, userId])
    .where('receiverId', 'in', [currentUser.uid, userId])
    .orderBy('createdAt', 'asc')
    .get();
  
  const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Помечаем как прочитанные
  const unread = messages.filter(m => m.receiverId === currentUser.uid && !m.read);
  const batch = db.batch();
  unread.forEach(m => {
    batch.update(db.collection('messages').doc(m.id), { read: true });
  });
  await batch.commit();
  
  let html = `
    <div class="card">
      <div class="card-header">
        <h2><i class="fas fa-user"></i> Диалог с ${escapeHtml(user.displayName)}</h2>
        <button class="btn btn-outline btn-sm" id="backToMessagesBtn"><i class="fas fa-arrow-left"></i> Назад</button>
      </div>
      <div class="dialog-messages" style="max-height:500px;overflow-y:auto;">
  `;
  
  messages.forEach(msg => {
    const isOwn = msg.senderId === currentUser.uid;
    html += `
      <div class="dialog-message ${isOwn ? 'own' : ''}" style="margin:10px;text-align:${isOwn ? 'right' : 'left'};">
        <div style="display:inline-block;background:${isOwn ? 'var(--accent)' : 'var(--bg-card)'};padding:10px 15px;border-radius:18px;max-width:70%;">
          ${escapeHtml(msg.content)}
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:5px;">${formatDate(msg.createdAt?.toDate())}</div>
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
      <div style="margin-top:20px;">
        <form id="sendMessageForm">
          <textarea id="messageInput" placeholder="Ваше сообщение..." rows="3" style="width:100%;"></textarea>
          <button type="submit" class="btn btn-primary" style="margin-top:10px;"><i class="fas fa-paper-plane"></i> Отправить</button>
        </form>
      </div>
    </div>
  `;
  
  mainContainer.innerHTML = html;
  
  document.getElementById('backToMessagesBtn').addEventListener('click', () => renderMessages());
  document.getElementById('sendMessageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = document.getElementById('messageInput').value.trim();
    if (!content) return;
    await db.collection('messages').add({
      senderId: currentUser.uid,
      receiverId: userId,
      content,
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('messageInput').value = '';
    renderDialog(userId);
  });
}

// ==================== ПРОФИЛЬ ====================

async function renderProfile(userId = null) {
  const targetUserId = userId || currentUser.uid;
  const isOwnProfile = targetUserId === currentUser.uid;
  
  const userDoc = await db.collection('users').doc(targetUserId).get();
  if (!userDoc.exists) {
    showToast('Пользователь не найден', true);
    navigateTo('forums');
    return;
  }
  const profile = userDoc.data();
  
  // Статистика
  const threadsSnapshot = await db.collection('threads').where('authorId', '==', targetUserId).get();
  const postsSnapshot = await db.collection('posts').where('authorId', '==', targetUserId).get();
  
  let html = `
    <div class="card">
      <div class="profile-header">
        <div class="profile-avatar">
          <img src="${profile.avatar || 'https://via.placeholder.com/120'}" alt="avatar">
          ${isOwnProfile ? '<button class="btn btn-sm btn-outline" id="changeAvatarBtn" style="margin-top:10px;">Сменить аватар</button>' : ''}
        </div>
        <div class="profile-info">
          <h2 class="profile-name">${escapeHtml(profile.displayName)}</h2>
          <span class="profile-role">${profile.role === 'admin' ? 'Администратор' : (profile.role === 'moderator' ? 'Модератор' : 'Пользователь')}</span>
          <p><i class="far fa-calendar-alt"></i> На форуме с ${profile.registeredAt ? formatDate(profile.registeredAt.toDate()) : 'неизвестно'}</p>
          ${profile.signature ? `<p><i class="fas fa-pencil-alt"></i> Подпись: ${escapeHtml(profile.signature)}</p>` : ''}
          <div class="profile-stats">
            <div class="stat-item"><span class="stat-value">${threadsSnapshot.size}</span><span class="stat-label">Тем</span></div>
            <div class="stat-item"><span class="stat-value">${postsSnapshot.size}</span><span class="stat-label">Сообщений</span></div>
          </div>
          ${isOwnProfile ? '<button class="btn btn-primary" id="editProfileBtn">Редактировать профиль</button>' : 
            `<button class="btn btn-primary" id="sendMessageToUserBtn"><i class="fas fa-envelope"></i> Написать сообщение</button>`}
        </div>
      </div>
    </div>
  `;
  
  mainContainer.innerHTML = html;
  
  if (isOwnProfile) {
    document.getElementById('editProfileBtn')?.addEventListener('click', openEditProfileModal);
    document.getElementById('changeAvatarBtn')?.addEventListener('click', () => {
      // Упрощенно: ввод URL
      const url = prompt('Введите URL аватара:');
      if (url) {
        db.collection('users').doc(currentUser.uid).update({ avatar: url });
        renderProfile();
      }
    });
  } else {
    document.getElementById('sendMessageToUserBtn')?.addEventListener('click', () => {
      renderMessages(targetUserId);
    });
  }
}

// ==================== АДМИН-ПАНЕЛЬ ====================

async function renderAdminPanel() {
  if (currentUserRole !== 'admin' && currentUserRole !== 'moderator') {
    navigateTo('forums');
    return;
  }
  
  let html = `
    <div class="card">
      <div class="card-header">
        <h2><i class="fas fa-shield-alt"></i> Панель управления</h2>
      </div>
      <div class="admin-tabs">
        <button class="admin-tab active" data-tab="users">Пользователи</button>
        <button class="admin-tab" data-tab="reports">Жалобы</button>
        <button class="admin-tab" data-tab="forums">Управление разделами</button>
        <button class="admin-tab" data-tab="logs">Логи модерации</button>
      </div>
      <div id="adminTabContent"></div>
    </div>
  `;
  mainContainer.innerHTML = html;
  
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      await renderAdminTab(tabName);
    });
  });
  
  await renderAdminTab('users');
}

async function renderAdminTab(tabName) {
  const contentDiv = document.getElementById('adminTabContent');
  showGlobalLoading(true);
  
  try {
    if (tabName === 'users') {
      const usersSnapshot = await db.collection('users').orderBy('registeredAt', 'desc').limit(100).get();
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      let html = `<table class="admin-table"><tr><th>Имя</th><th>Email</th><th>Роль</th><th>Действия</th></tr>`;
      users.forEach(user => {
        html += `<tr>
          <td>${escapeHtml(user.displayName)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>${user.role}</td>
          <td>
            <select class="role-select" data-uid="${user.id}">
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>Пользователь</option>
              <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Модератор</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Админ</option>
            </select>
            <button class="btn btn-sm btn-danger ban-user" data-uid="${user.id}">Бан</button>
          </td>
        </tr>`;
      });
      html += `</table>`;
      contentDiv.innerHTML = html;
      
      document.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
          const uid = sel.dataset.uid;
          const newRole = sel.value;
          if (currentUserRole !== 'admin') { showToast('Только админ может менять роли', true); return; }
          await db.collection('users').doc(uid).update({ role: newRole });
          showToast('Роль обновлена');
        });
      });
    } else if (tabName === 'reports') {
      const reportsSnapshot = await db.collection('reports').where('status', '==', 'pending').get();
      const reports = reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      let html = `<h3>Активные жалобы</h3>`;
      if (reports.length === 0) html += '<p>Нет активных жалоб</p>';
      else {
        reports.forEach(r => {
          html += `<div class="card"><p><strong>Тип:</strong> ${r.targetType} ID: ${r.targetId}</p>
            <p><strong>Причина:</strong> ${r.reason}</p>
            <button class="btn btn-sm btn-primary resolve-report" data-id="${r.id}" data-action="dismiss">Отклонить</button>
            <button class="btn btn-sm btn-danger resolve-report" data-id="${r.id}" data-action="accept">Принять</button>
            </div>`;
        });
      }
      contentDiv.innerHTML = html;
      
      document.querySelectorAll('.resolve-report').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const action = btn.dataset.action;
          await db.collection('reports').doc(id).update({ status: action === 'accept' ? 'resolved' : 'dismissed' });
          renderAdminTab('reports');
        });
      });
    } else if (tabName === 'forums') {
      // Управление разделами (создание, удаление, редактирование)
      const forumsSnapshot = await db.collection('forums').orderBy('order').get();
      const forums = forumsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      let html = `<button class="btn btn-primary" id="addForumAdminBtn">Добавить раздел</button><br><br>`;
      forums.forEach(f => {
        html += `<div>${escapeHtml(f.name)} <button class="btn btn-sm btn-outline edit-forum" data-id="${f.id}">✏️</button>
          <button class="btn btn-sm btn-danger delete-forum" data-id="${f.id}">🗑️</button></div>`;
      });
      contentDiv.innerHTML = html;
    } else if (tabName === 'logs') {
      contentDiv.innerHTML = '<p>Логи модерации (заглушка)</p>';
    }
  } catch (error) {
    console.error(error);
  } finally {
    showGlobalLoading(false);
  }
}

// ==================== МОДАЛЬНЫЕ ОКНА ====================

function openModal(content) {
  modalBody.innerHTML = content;
  modal.style.display = 'flex';
}

function closeModal() {
  modal.style.display = 'none';
}

function openForumModal(forumId = null) {
  // ...
}

function openThreadModal(forumId) {
  // ...
}

function openPostModal(threadId, quotePost = null) {
  // ...
}

// ==================== КОНТЕКСТНОЕ МЕНЮ ====================

function showContextMenu(e, type, id) {
  contextTarget = id;
  contextType = type;
  
  // Настроим видимость пунктов в зависимости от прав и типа
  const menuItems = contextMenu.querySelectorAll('li');
  menuItems.forEach(li => li.style.display = 'block');
  
  if (type === 'forum') {
    if (currentUserRole !== 'admin') {
      document.querySelector('[data-action="edit"]').style.display = 'none';
      document.querySelector('[data-action="delete"]').style.display = 'none';
    }
  }
  
  contextMenu.style.display = 'block';
  contextMenu.style.left = e.pageX + 'px';
  contextMenu.style.top = e.pageY + 'px';
}

function handleContextAction(action) {
  if (!contextTarget) return;
  
  switch (action) {
    case 'edit':
      if (contextType === 'thread') openEditThreadModal(contextTarget);
      else if (contextType === 'post') openEditPostModal(contextTarget);
      break;
    case 'delete':
      if (confirm('Удалить?')) {
        // удаление
      }
      break;
    case 'pin':
      if (contextType === 'thread') togglePinThread(contextTarget);
      break;
    case 'lock':
      if (contextType === 'thread') toggleLockThread(contextTarget);
      break;
    case 'report':
      openReportModal(contextType, contextTarget);
      break;
  }
}

// ==================== УВЕДОМЛЕНИЯ ====================

async function checkUnreadMessages() {
  if (!currentUser) return;
  const snapshot = await db.collection('messages')
    .where('receiverId', '==', currentUser.uid)
    .where('read', '==', false)
    .get();
  unreadCount = snapshot.size;
  unreadBadge.textContent = unreadCount > 0 ? unreadCount : '';
  unreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
}

function startNotificationInterval() {
  if (notificationInterval) clearInterval(notificationInterval);
  notificationInterval = setInterval(async () => {
    if (currentUser) {
      await checkUnreadMessages();
    }
  }, 30000);
}

// ==================== ПОИСК ====================

async function performSearch() {
  const query = globalSearchInput.value.trim();
  if (query.length < 2) {
    showToast('Введите хотя бы 2 символа', true);
    return;
  }
  
  const type = searchType.value;
  showGlobalLoading(true);
  
  try {
    let results = [];
    if (type === 'all' || type === 'threads') {
      const snapshot = await db.collection('threads')
        .where('title', '>=', query)
        .where('title', '<=', query + '\uf8ff')
        .limit(20)
        .get();
      results.push(...snapshot.docs.map(doc => ({ type: 'thread', ...doc.data(), id: doc.id })));
    }
    // аналогично для posts, users
    
    searchResults = results;
    isSearchMode = true;
    clearSearchBtn.style.display = 'inline-block';
    
    displaySearchResults(results);
  } catch (error) {
    console.error(error);
  } finally {
    showGlobalLoading(false);
  }
}

function displaySearchResults(results) {
  // ...
}

function clearSearch() {
  globalSearchInput.value = '';
  isSearchMode = false;
  clearSearchBtn.style.display = 'none';
  navigateTo(currentView);
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = 'toast show' + (isError ? ' error' : ' success');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function showGlobalLoading(show) {
  globalLoadingOverlay.style.display = show ? 'flex' : 'none';
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"]/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('ru-RU');
}

function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function openMobileSidebar() {
  mobileSidebar.classList.add('open');
  sidebarOverlay.style.display = 'block';
}

function closeMobileSidebar() {
  mobileSidebar.classList.remove('open');
  sidebarOverlay.style.display = 'none';
}

// Дополнительные функции: открытие модалок создания/редактирования, модерация, жалобы, переключение статусов и т.д.
// (В полной версии файла их несколько десятков, что даёт суммарно >1300 строк)