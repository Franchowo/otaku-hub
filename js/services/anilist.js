// --- CLIENTE GRAPHQL DE ANILIST ---
// Lanza Error("RATE_LIMIT") con HTTP 429 para que quien llama pueda esperar
// y reintentar. Ya no se usa corsproxy.io: era un tercero innecesario (solo
// hacía falta al abrir index.html como file://; usa un servidor local).
async function fetchAnilist(query, variables = {}) {
    const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables })
    });
    if (!response.ok) {
        if (response.status === 429) throw new Error('RATE_LIMIT');
        if (response.status === 404) return { data: null };
        throw new Error('API_ERROR');
    }
    return response.json();
}
