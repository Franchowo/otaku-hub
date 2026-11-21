        // --- HELPER CENTRAL PARA ANILIST (GraphQL) CON MANEJO DE ERRORES Y PROXY ---
async function fetchAnilist(query, variables = {}) {
    const url = 'https://graphql.anilist.co';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables })
    };

    try {
        // Intento 1: Conexión directa
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 429) throw new Error("RATE_LIMIT");
            if (response.status === 404) return { data: null };
            throw new Error("API_ERROR");
        }
        return await response.json();
    } catch (e) {
        // Intento 2: Bypass de CORS si se abre el archivo como file:///
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            console.warn("Bloqueo CORS detectado. Usando proxy...");
            try {
                const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
                const proxyResponse = await fetch(proxyUrl, options);
                if (!proxyResponse.ok) throw new Error("API_ERROR_PROXY");
                return await proxyResponse.json();
            } catch (proxyError) {
                console.error("El proxy también falló:", proxyError);
                throw proxyError;
            }
        }
        throw e;
    }
}
