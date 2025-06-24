// Global değişkenler
let peer;
let localStream;
let isHost = false;
let roomCode = '';
const connectedPeers = new Map();

// Bildirim gösterme
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-info-circle mr-2"></i>
        ${message}
    `;
    
    document.getElementById('notifications').appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Oda kodu oluşturma
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result.toUpperCase();
}

// Durum güncelleme
function updateStatus(status, message) {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    
    indicator.classList.remove('bg-red-500', 'bg-green-500', 'bg-yellow-500', 'bg-blue-500');
    
    switch(status) {
        case 'ready':
            indicator.classList.add('bg-green-500');
            break;
        case 'connecting':
            indicator.classList.add('bg-yellow-500');
            break;
        case 'error':
            indicator.classList.add('bg-red-500');
            break;
        case 'sharing':
            indicator.classList.add('bg-blue-500');
            break;
        default:
            indicator.classList.add('bg-red-500');
    }
    text.textContent = message;
}

// UI elementlerini alma
const modeSelection = document.getElementById('modeSelection');
const hostMode = document.getElementById('hostMode');
const viewerMode = document.getElementById('viewerMode');
const backBtn = document.getElementById('backBtn');

// Butonlar
const hostBtn = document.getElementById('hostBtn');
const viewerBtn = document.getElementById('viewerBtn');
const startShareBtn = document.getElementById('startShareBtn');
const stopShareBtn = document.getElementById('stopShareBtn');
const copyRoomBtn = document.getElementById('copyRoomBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

// Diğer elementler
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const roomCodeEl = document.getElementById('roomCode');
const roomCodeInput = document.getElementById('roomCodeInput');
const userCount = document.getElementById('userCount');
const connectedUsers = document.getElementById('connectedUsers');
const shareLink = document.getElementById('shareLink');
const connectionPanel = document.getElementById('connectionPanel');
const videoPanel = document.getElementById('videoPanel');
const localVideoPlaceholder = document.getElementById('localVideoPlaceholder');
const currentRoom = document.getElementById('currentRoom');

// Mod seçimi
hostBtn.addEventListener('click', () => {
    isHost = true;
    modeSelection.classList.add('hidden');
    hostMode.classList.remove('hidden');
    backBtn.classList.remove('hidden');
    initializeHost();
});

viewerBtn.addEventListener('click', () => {
    isHost = false;
    modeSelection.classList.add('hidden');
    viewerMode.classList.remove('hidden');
    backBtn.classList.remove('hidden');
    initializeViewer();
});

function goBack() {
    window.location.reload();
}

function initializeHost() {
    isHost = true;
    updateStatus('connecting', 'Sunucu başlatılıyor...');
    roomCode = generateRoomCode();
    peer = new Peer(roomCode);

    peer.on('open', (id) => {
        roomCodeEl.textContent = id;
        shareLink.value = `${window.location.origin}${window.location.pathname}?room=${id}`;
        updateStatus('ready', 'Paylaşıma Hazır');
        showNotification(`Oda oluşturuldu: ${id}`, 'success');
    });

    peer.on('connection', (conn) => {
        showNotification(`${conn.peer.substring(0,6)} bağlandı.`);
        connectedPeers.set(conn.peer, conn);
        updateConnectedUsers();

        conn.on('close', () => {
            showNotification(`${conn.peer.substring(0,6)} ayrıldı.`);
            connectedPeers.delete(conn.peer);
            updateConnectedUsers();
        });
    });

    peer.on('error', (err) => {
        console.error('PeerJS Hatası:', err);
        showNotification(`Bir hata oluştu: ${err.message}`, 'error');
        updateStatus('error', 'Hata');
    });
}

function initializeViewer() {
    isHost = false;
    updateStatus('ready', 'İzlemeye Hazır');
    peer = new Peer(); // Viewer için rastgele ID

    peer.on('open', () => {
        updateStatus('ready', 'İzlemeye Hazır');
    });
     peer.on('call', (call) => {
        call.answer(); // Gelen çağrıyı cevapla (stream beklemeden)
        call.on('stream', (remoteStream) => {
            remoteVideo.srcObject = remoteStream;
            videoPanel.classList.remove('hidden');
            connectionPanel.classList.add('hidden');
            updateStatus('sharing', 'İzleniyor');
            showNotification('Yayın alındı!', 'success');
        });
        call.on('close', () => {
            showNotification('Yayıncı bağlantıyı kesti.');
            goBack();
        });
    });


    peer.on('error', (err) => {
        console.error('PeerJS Hatası:', err);
        showNotification(`Bir hata oluştu: ${err.message}`, 'error');
        updateStatus('error', 'Hata');
    });

    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
        roomCodeInput.value = room;
    }
}

// Ekran paylaşımını başlat
startShareBtn.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: { echoCancellation: true, noiseSuppression: true }
        });
        localVideo.srcObject = localStream;
        localVideoPlaceholder.classList.add('hidden');
        startShareBtn.disabled = true;
        stopShareBtn.disabled = false;
        startShareBtn.classList.remove('pulse');
        updateStatus('sharing', 'Paylaşılıyor...');
        showNotification('Ekran paylaşımı başladı!', 'success');

        localStream.getTracks().forEach(track => {
            track.onended = () => {
                stopShareBtn.click();
            };
        });
        
        // Bağlı olan tüm peer'ları ara ve stream'i gönder
        connectedPeers.forEach((conn) => {
            peer.call(conn.peer, localStream);
        });

    } catch (err) {
        console.error("Ekran paylaşılamadı:", err);
        showNotification('Ekran paylaşımı başlatılamadı.', 'error');
        updateStatus('error', 'Hata oluştu');
    }
});

// Ekran paylaşımını durdur
stopShareBtn.addEventListener('click', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    localVideo.srcObject = null;
    localVideoPlaceholder.classList.remove('hidden');
    startShareBtn.disabled = false;
    stopShareBtn.disabled = true;
    startShareBtn.classList.add('pulse');
    updateStatus('ready', 'Paylaşıma Hazır');
    showNotification('Ekran paylaşımı durduruldu.');
    
    // Tüm bağlantıları kapat
    connectedPeers.forEach(conn => conn.close());
    connectedPeers.clear();
    updateConnectedUsers();
});

// Kopyalama butonları
copyRoomBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCodeEl.textContent);
    showNotification('Oda kodu kopyalandı!');
});

copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLink.value);
    showNotification('Paylaşım linki kopyalandı!');
});


// İzleyici: Odaya katılma
joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length === 6 && peer) {
        updateStatus('connecting', 'Bağlanılıyor...');
        const conn = peer.connect(code);
        
        conn.on('open', () => {
            currentRoom.textContent = code;
            showNotification(`Odaya bağlanıldı: ${code}`, 'success');
            // Host'un stream göndermesini bekleyeceğiz.
        });

        conn.on('error', (err) => {
            showNotification(`Bağlantı hatası: ${err.message}`, 'error');
            updateStatus('error', 'Bağlantı Hatası');
        });

    } else {
        showNotification('Geçersiz oda kodu veya PeerJS hazır değil.', 'error');
    }
});

disconnectBtn.addEventListener('click', () => {
    goBack();
});


function updateConnectedUsers() {
    userCount.textContent = connectedPeers.size;
    connectedUsers.innerHTML = '';
    if (connectedPeers.size === 0) {
        connectedUsers.innerHTML = '<div class="text-slate-500 text-sm">Henüz kimse bağlanmadı</div>';
        return;
    }
    
    connectedPeers.forEach((conn, id) => {
        const userBadge = document.createElement('div');
        userBadge.className = 'user-badge';
        userBadge.textContent = `İzleyici ${id.substring(0, 6)}`;
        connectedUsers.appendChild(userBadge);
    });
}

// Başlangıç durumu
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('ready', 'Hazır');
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
        // Otomatik olarak izleyici modunda başlat
        viewerBtn.click();
        roomCodeInput.value = room;
        joinRoomBtn.click();
    }
}); 
