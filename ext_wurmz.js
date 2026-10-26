// ID: ext_wurmz
// NAME: Wurmz
// VERSION: 2.9.0
// COLOR: #FF7A00
// ICON: https://wurmz.net/favicon.ico
// REFERER: https://wurmz.net/

const BASE_URL = 'https://wurmz.net';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const headers = {
    'User-Agent': USER_AGENT,
    'Referer': BASE_URL + '/',
};

function cleanPath(path) {
    if (!path) return '';
    let cleaned = path.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/+/, '');
    if (cleaned.startsWith('detail/')) {
        cleaned = cleaned.substring(7);
    }
    return cleaned;
}

const KonmikExtension = {
    
    // -- 1. Memuat daftar komik --
    async getList(page, query, filters) {
        const pageNum = page || 1;
        let url = `${BASE_URL}/?page=${pageNum}`;
        
        if (query) {
            url = `${BASE_URL}/search?q=${encodeURIComponent(query)}&page=${pageNum}`;
        } else if (filters && filters.type) {
            url += `&type=${encodeURIComponent(filters.type.toLowerCase())}`;
        }
        
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const html = await res.text();
        
        const mangaList = [];
        const regex = /<article class="comic-card group[^>]*>.*?href="\/detail\/([^"]+)".*?<img[^>]+src="([^"]+)".*?<h2 class="comic-title[^>]*>(.*?)<\/h2>/gs;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            let id = cleanPath(match[1]);
            let coverUrl = match[2];
            let title = match[3].replace(/<[^>]*>/g, '').trim();
            
            if (!coverUrl.startsWith('http')) {
                coverUrl = BASE_URL + coverUrl;
            }
            
            mangaList.push({
                id: id,            
                title: title,                
                cover_url: coverUrl,  
                rating: '0.0', 
                views: '-'
            });
        }
        
        return { manga_list: mangaList };
    },

    // -- 2. Memuat detail info komik & seluruh chapter --
    async getDetail(slug) {
        const cleanSlug = cleanPath(slug);
        const url = `${BASE_URL}/detail/${cleanSlug}`;
        
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const html = await res.text();

        // Cover
        let coverUrl = '';
        const coverMatch = html.match(/<div class="cover-frame">.*?<img[^>]+src="([^"]+)"/);
        if (coverMatch) {
            coverUrl = coverMatch[1];
            if (!coverUrl.startsWith('http')) coverUrl = BASE_URL + coverUrl;
        }

        // Judul Utama
        let title = cleanSlug;
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/);
        if (titleMatch) title = titleMatch[1].replace(' Bahasa Indonesia', '').trim();

        // Deskripsi
        let description = 'Tidak ada deskripsi';
        const descMatch = html.match(/<p class="text-sm text-muted leading-relaxed">(.*?)<\/p>/);
        if (descMatch) description = descMatch[1].trim();

        // Author
        let author = '?';
        const authorMatch = html.match(/Oleh <!-- -->(.*?)<!-- -->/);
        if (authorMatch) author = authorMatch[1].trim();

        // Genre
        let genres = [];
        const genreRegex = /<a href="\/genre\/[^"]+" class="chip">(.*?)<\/a>/g;
        let gMatch;
        while ((gMatch = genreRegex.exec(html)) !== null) {
            genres.push(gMatch[1].trim());
        }

        // --- Ekstraksi Bab & Waktu Rilis ---
        let chapters = [];
        const seenChapters = new Set();
        const chapterDateMap = {};

        // Ambil waktu dari elemen baris chapter jika tersedia dari server
        const rowRegex = /href=["'][^"']*\/chapter\/([^"'\?#]+)["'][^>]*>(.*?)<\/a>/gs;
        let rMatch;
        while ((rMatch = rowRegex.exec(html)) !== null) {
            const chNum = rMatch[1].trim();
            const innerHtml = rMatch[2];

            const timeMatch = innerHtml.match(/<(?:span|time)[^>]*class=["'][^"']*ch-time[^"']*["'][^>]*>(.*?)<\/(?:span|time)>/s) ||
                              innerHtml.match(/<(?:span|time)[^>]*>(.*?)<\/(?:span|time)>/s);
            
            let timeStr = '';
            if (timeMatch) {
                let cleaned = timeMatch[1].replace(/<[^>]*>/g, '').replace(/<!-- -->/g, '').trim();
                let lower = cleaned.toLowerCase();
                if (cleaned && !lower.startsWith('ch.') && !lower.startsWith('chapter')) {
                    timeStr = cleaned;
                }
            }
            if (chNum && timeStr) {
                chapterDateMap[chNum] = timeStr;
            }
        }

        // Ambil seluruh nomor chapter dari data JSON / script Next.js agar chapter lama tetap muncul lengkap
        const safeHtml = html.replace(/\\"/g, '"').replace(/\\\//g, '/');
        const labelRegex = /"chapter_label"\s*:\s*("[^"]+"|\d+)/g;
        const allLabels = [];
        let lMatch;
        while ((lMatch = labelRegex.exec(safeHtml)) !== null) {
            let num = lMatch[1].replace(/"/g, '').trim();
            if (num && !allLabels.includes(num)) {
                allLabels.push(num);
            }
        }

        // Fallback jika label JSON tidak ada
        if (allLabels.length === 0) {
            const hrefRegex = /href=["'][^"']*\/chapter\/([^"'\?#]+)["']/g;
            let hMatch;
            while ((hMatch = hrefRegex.exec(html)) !== null) {
                let num = hMatch[1].trim();
                if (num && !allLabels.includes(num)) {
                    allLabels.push(num);
                }
            }
        }

        // Susun daftar chapter final
        for (const chNum of allLabels) {
            const chId = `${cleanSlug}/chapter/${chNum}`;
            if (!seenChapters.has(chId)) {
                seenChapters.add(chId);
                chapters.push({
                    id: chId,
                    title: `Chapter ${chNum}`,
                    date: chapterDateMap[chNum] || ''
                });
            }
        }

        return {
            title: title,
            cover_url: coverUrl,
            description: description,
            rating: '0.0',
            views: '-',
            genres: genres,
            author: author,
            artist: "?",
            chapters: chapters
        };
    },

    // -- 3. Memuat gambar saat chapter dibaca --
    async getChapterImages(chapterId) {
        const cleanChapterId = cleanPath(chapterId);
        const url = `${BASE_URL}/detail/${cleanChapterId}`;

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const html = await res.text();

        const images = [];
        const seen = new Set();
        const safeHtml = html.replace(/\\"/g, '"').replace(/\\\//g, '/');

        const cdnRegex = /https?:\/\/cdn\d*\.wurmz\.net\/img\/[^\s"'\s\)\>\\]+/g;
        let match;
        while ((match = cdnRegex.exec(safeHtml)) !== null) {
            let cleanUrl = match[0];
            if (!cleanUrl.includes('cover') && !seen.has(cleanUrl)) {
                seen.add(cleanUrl);
                images.push(cleanUrl);
            }
        }

        if (images.length === 0) {
            const jsonMatch = safeHtml.match(/"images"\s*:\s*(\[[^\]]+\])/);
            if (jsonMatch) {
                const urlRegex = /https?:\/\/[^\s"'\\]+/g;
                let uMatch;
                while ((uMatch = urlRegex.exec(jsonMatch[1])) !== null) {
                    let cleanUrl = uMatch[0];
                    if (!cleanUrl.includes('cover') && !seen.has(cleanUrl)) {
                        seen.add(cleanUrl);
                        images.push(cleanUrl);
                    }
                }
            }
        }

        if (images.length === 0) {
            const imgTagRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/g;
            while ((match = imgTagRegex.exec(safeHtml)) !== null) {
                let src = match[1];
                if ((src.includes('wurmz.net') || src.includes('cdn')) && !src.includes('cover') && !seen.has(src)) {
                    seen.add(src);
                    images.push(src);
                }
            }
        }

        return images;
    }
};
