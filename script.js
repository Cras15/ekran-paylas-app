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
const localFullscreenBtn = document.getElementById('localFullscreenBtn');
const remoteFullscreenBtn = document.getElementById('remoteFullscreenBtn');

// Tam ekran yardımcı fonksiyonları
function toggleFullScreen(element) {
    if (!document.fullscreenElement) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) { /* Safari */
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) { /* IE11 */
            element.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
    }
}

// Tam ekran buton işlevleri
localFullscreenBtn.addEventListener('click', () => {
    toggleFullScreen(localVideo);
});

remoteFullscreenBtn.addEventListener('click', () => {
    toggleFullScreen(remoteVideo);
});

// Video butonlarını göster/gizle fonksiyonu
function updateVideoControls(videoElement, fullscreenBtn) {
    if (videoElement.srcObject) {
        fullscreenBtn.classList.remove('hidden');
    } else {
        fullscreenBtn.classList.add('hidden');
    }
}

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

        conn.on('data', (data) => {
            console.log('İstemciden veri alındı:', data);
            
            // İstemci akış isterse yeniden arama yap
            if (data.type === 'request-stream' && localStream) {
                showNotification(`${conn.peer.substring(0,6)} için yeniden bağlantı sağlanıyor...`);
                callPeer(conn.peer);
            }
        });

        // Yeni bağlanan kullanıcıya mevcut akışı gönder
        if (localStream) {
            setTimeout(() => {
                callPeer(conn.peer);
                conn.send({
                    type: 'host-ready',
                    hasStream: true
                });
            }, 1000);
        } else {
            conn.send({
                type: 'host-ready',
                hasStream: false
            });
        }

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
    peer = new Peer({
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        },
        debug: 2
    });

    peer.on('open', () => {
        updateStatus('ready', 'İzlemeye Hazır');
    });
    
    peer.on('call', (call) => {
        console.log('Gelen arama:', call);
        
        // Gelen aramayı cevapla
        call.answer();
        showNotification('Yayın bağlantısı alındı...', 'info');
        
        call.on('stream', (remoteStream) => {
            console.log('Stream alındı', remoteStream);
            remoteVideo.srcObject = remoteStream;
            
            // Ses ve video izleri kontrolü
            const videoTracks = remoteStream.getVideoTracks();
            const audioTracks = remoteStream.getAudioTracks();
            
            console.log(`Video izleri: ${videoTracks.length}, Ses izleri: ${audioTracks.length}`);
            
            if (videoTracks.length > 0) {
                // Video kalitesi için izleyiciler
                const videoTrack = videoTracks[0];
                
                videoTrack.addEventListener('mute', () => {
                    console.log('Video duraklatıldı');
                    showNotification('Video duraklatıldı, yeniden bağlanılıyor...', 'info');
                });
                
                videoTrack.addEventListener('unmute', () => {
                    console.log('Video devam ediyor');
                    showNotification('Video devam ediyor', 'success');
                });
            }
            
            updateVideoControls(remoteVideo, remoteFullscreenBtn);
            videoPanel.classList.remove('hidden');
            connectionPanel.classList.add('hidden');
            updateStatus('sharing', 'İzleniyor');
            showNotification('Yayın alındı!', 'success');
        });
        
        call.on('error', (err) => {
            console.error('Arama hatası:', err);
            showNotification('Yayın bağlantısında hata: ' + err.message, 'error');
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

    peer.on('disconnected', () => {
        showNotification('Bağlantı kesildi, yeniden bağlanılıyor...', 'warning');
        updateStatus('connecting', 'Yeniden bağlanılıyor...');
        
        // Yeniden bağlanmaya çalış
        setTimeout(() => {
            peer.reconnect();
        }, 1000);
    });
    
    peer.on('close', () => {
        showNotification('Bağlantı sonlandırıldı.', 'error');
        updateStatus('error', 'Bağlantı Sonlandı');
        goBack();
    });

    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
        roomCodeInput.value = room;
    }
}

// Video elementini yapılandır
function configureVideoElement(videoElement, containerElement) {
    // Video performansı ve kalitesi için ayarlar
    videoElement.playsInline = true;
    videoElement.autoplay = true;
    
    // Video yüklendiğinde
    videoElement.addEventListener('loadeddata', () => {
        console.log('Video verisi yüklendi');
        if (containerElement) {
            containerElement.classList.add('loaded');
        }
    });
    
    // Video oynatılmaya başladığında
    videoElement.addEventListener('playing', () => {
        console.log('Video oynatılıyor');
        if (containerElement) {
            containerElement.classList.add('loaded');
        }
    });
    
    // Video istatistikleri için olay dinleyicisi
    videoElement.addEventListener('loadedmetadata', () => {
        console.log(`Video boyutları: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
    });
    
    // Hata durumunda
    videoElement.addEventListener('error', (e) => {
        console.error('Video hatası:', e);
        showNotification('Video yüklenirken hata oluştu', 'error');
        if (containerElement) {
            containerElement.classList.remove('loaded');
            containerElement.classList.add('show-warning');
        }
    });
    
    // Durdurma durumunda
    videoElement.addEventListener('stalled', () => {
        console.warn('Video durdu, yeniden başlatılıyor...');
        if (containerElement) {
            containerElement.classList.remove('loaded');
        }
    });
    
    // Duraklama durumunda
    videoElement.addEventListener('pause', () => {
        console.log('Video duraklatıldı');
    });
    
    // Başlama durumunda
    videoElement.addEventListener('play', () => {
        console.log('Video başladı');
        if (containerElement) {
            containerElement.classList.add('loaded');
        }
    });
}

// Ekran paylaşımını başlat
startShareBtn.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
                cursor: "always",
                displaySurface: "monitor",
                logicalSurface: true,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30, max: 60 }
            },
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        localVideo.srcObject = localStream;
        localVideoPlaceholder.classList.add('hidden');
        updateVideoControls(localVideo, localFullscreenBtn);
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
        
        // Bağlı olan tüm peer'lara stream gönder
        connectedPeers.forEach((conn) => {
            callPeer(conn.peer);
        });

    } catch (err) {
        console.error("Ekran paylaşılamadı:", err);
        showNotification('Ekran paylaşımı başlatılamadı.', 'error');
        updateStatus('error', 'Hata oluştu');
    }
});

// Peer'a arama yapma fonksiyonu
function callPeer(peerId) {
    if (localStream && peer) {
        console.log(`${peerId} ID'li kullanıcı aranıyor...`);
        const call = peer.call(peerId, localStream, {
            metadata: { type: 'screen-share' },
            sdpTransform: (sdp) => {
                // Daha yüksek bit hızı için SDP ayarları
                return sdp.replace('b=AS:2000', 'b=AS:8000');
            }
        });
        
        if (call) {
            console.log(`${peerId} ID'li kullanıcı arandı.`);
        }
    } else {
        console.warn("Stream yok veya peer bağlantısı hazır değil.");
    }
}

// Ekran paylaşımını durdur
stopShareBtn.addEventListener('click', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    localVideo.srcObject = null;
    localVideoPlaceholder.classList.remove('hidden');
    updateVideoControls(localVideo, localFullscreenBtn);
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
        currentRoom.textContent = code;
        
        const conn = peer.connect(code, {
            reliable: true,
            serialization: 'json'
        });
        
        conn.on('open', () => {
            showNotification(`Odaya bağlanıldı: ${code}`, 'success');
            videoPanel.classList.remove('hidden');
            connectionPanel.classList.add('hidden');
            updateStatus('ready', 'Bağlandı');
            
            // Metadata gönder
            conn.send({
                type: 'viewer-connected',
                peerId: peer.id,
                timestamp: Date.now()
            });
            
            // 3 saniye sonra bağlantı kontrolü yap
            setTimeout(() => {
                if (!remoteVideo.srcObject) {
                    showNotification('Görüntü alınamadı. Yayıncıdan yeniden bağlantı isteniyor...', 'info');
                    conn.send({
                        type: 'request-stream',
                        peerId: peer.id,
                        timestamp: Date.now()
                    });
                }
            }, 3000);
        });

        conn.on('data', (data) => {
            console.log('Veri alındı:', data);
            if (data.type === 'host-ready') {
                showNotification('Yayıncı hazır, görüntü bekleniyor...', 'info');
            }
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
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
        updateVideoControls(remoteVideo, remoteFullscreenBtn);
    }
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
    
    // Video konteynırlarını seçin
    const localVideoContainer = localVideo.closest('.video-container');
    const remoteVideoContainer = remoteVideo.closest('.video-container');
    
    // Video elementlerini yapılandır
    configureVideoElement(localVideo, localVideoContainer);
    configureVideoElement(remoteVideo, remoteVideoContainer);
    
    // Video konteynırlarına bağlantı uyarı elemanlarını ekle
    if (localVideoContainer) {
        const localWarning = document.createElement('div');
        localWarning.className = 'connection-warning';
        localWarning.textContent = 'Bağlantı sorunu yaşanıyor...';
        localVideoContainer.appendChild(localWarning);
    }
    
    if (remoteVideoContainer) {
        const remoteWarning = document.createElement('div');
        remoteWarning.className = 'connection-warning';
        remoteWarning.textContent = 'Bağlantı sorunu yaşanıyor...';
        remoteVideoContainer.appendChild(remoteWarning);
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
        // Otomatik olarak izleyici modunda başlat
        viewerBtn.click();
        roomCodeInput.value = room;
        joinRoomBtn.click();
    }

    // Fullscreen API desteğini kontrol et
    if (!document.fullscreenEnabled && 
        !document.webkitFullscreenEnabled && 
        !document.msFullscreenEnabled) {
        console.warn("Tarayıcınız tam ekran modunu desteklemiyor.");
        localFullscreenBtn.classList.add('hidden');
        remoteFullscreenBtn.classList.add('hidden');
    }
}); 