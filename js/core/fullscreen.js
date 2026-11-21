// --- SISTEMA DE ROTACIÓN Y PANTALLA COMPLETA ---
        async function toggleLandscape() {
            try {
                if (!document.fullscreenElement) {
                    // 1. Solicitamos entrar en pantalla completa (requisito de seguridad de los navegadores)
                    await document.documentElement.requestFullscreen();
                    
                    // 2. Intentamos bloquear la pantalla en modo horizontal
                    if (screen.orientation && screen.orientation.lock) {
                        await screen.orientation.lock("landscape");
                    }
                } else {
                    // Si ya estamos en pantalla completa, salimos y liberamos la orientación
                    if (document.exitFullscreen) {
                        await document.exitFullscreen();
                    }
                    if (screen.orientation && screen.orientation.unlock) {
                        screen.orientation.unlock();
                    }
                }
            } catch (err) {
                console.warn("Rotación forzada no soportada:", err);
                alert("⚠️ Tu dispositivo o navegador actual (como iOS Safari) no permite forzar la rotación automáticamente. Por favor, gira el dispositivo físicamente.");
            }
        }
