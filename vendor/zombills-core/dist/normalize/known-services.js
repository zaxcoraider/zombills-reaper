// Built-in Known service list. See .kiro/specs/merchant-normalizer/design.md ("Known service data").
// Variant texts are in canonical folded token form, exactly what joinTokens(lex(text), "folded")
// returns. For "contains" variants this is the context form (so "microsoft 365" keeps "365").
function contains(text) {
    return Object.freeze({ text, match: "contains" });
}
function exact(text) {
    return Object.freeze({ text, match: "exact" });
}
function service(serviceId, displayName, category, variants) {
    return Object.freeze({
        serviceId,
        displayName,
        category,
        variants: Object.freeze([...variants]),
    });
}
const VIDEO_STREAMING = [
    service("netflix", "Netflix", "video-streaming", [contains("netflix"), contains("netflix com")]),
    service("disney-plus", "Disney+", "video-streaming", [
        contains("disney+"),
        contains("disney plus"),
        contains("disneyplus"),
    ]),
    service("hulu", "Hulu", "video-streaming", [contains("hulu"), contains("hulu plus")]),
    service("max", "Max", "video-streaming", [exact("max"), contains("hbo max"), contains("hbomax")]),
    service("paramount-plus", "Paramount+", "video-streaming", [
        contains("paramount+"),
        contains("paramount plus"),
        contains("paramountplus"),
    ]),
    service("peacock", "Peacock", "video-streaming", [
        exact("peacock"),
        contains("peacocktv"),
        contains("peacock tv"),
        contains("peacock premium"),
    ]),
    service("apple-tv-plus", "Apple TV+", "video-streaming", [
        contains("apple tv+"),
        contains("apple tv plus"),
        contains("appletv+"),
    ]),
    service("youtube-premium", "YouTube Premium", "video-streaming", [
        contains("youtube premium"),
        contains("youtubepremium"),
    ]),
    service("amazon-prime", "Amazon Prime", "video-streaming", [
        contains("amazon prime"),
        contains("amzn prime"),
        contains("amazon prime membership"),
        contains("prime video membership"),
        contains("primevideo membership"),
    ]),
    service("crunchyroll", "Crunchyroll", "video-streaming", [
        contains("crunchyroll"),
        contains("crunchyroll premium"),
    ]),
    service("dazn", "DAZN", "video-streaming", [contains("dazn"), contains("dazn limited")]),
    service("espn-plus", "ESPN+", "video-streaming", [
        contains("espn+"),
        contains("espn plus"),
        contains("espnplus"),
    ]),
    service("discovery-plus", "discovery+", "video-streaming", [
        contains("discovery+"),
        contains("discovery plus"),
        contains("discoveryplus"),
    ]),
    service("sling-tv", "Sling TV", "video-streaming", [
        contains("sling tv"),
        contains("slingtv"),
        exact("sling"),
    ]),
];
const MUSIC_AUDIO = [
    service("spotify", "Spotify", "music-audio", [
        contains("spotify"),
        contains("spotify usa"),
        contains("spotify ab"),
    ]),
    service("apple-music", "Apple Music", "music-audio", [
        contains("apple music"),
        contains("applemusic"),
    ]),
    service("amazon-music", "Amazon Music Unlimited", "music-audio", [
        contains("amazon music unlimited"),
        contains("amazon music"),
        contains("amzn music"),
    ]),
    service("youtube-music", "YouTube Music", "music-audio", [
        contains("youtube music"),
        contains("youtubemusic"),
    ]),
    service("tidal", "TIDAL", "music-audio", [exact("tidal"), contains("tidal music")]),
    service("deezer", "Deezer", "music-audio", [contains("deezer"), contains("deezer premium")]),
    service("audible", "Audible", "music-audio", [contains("audible"), contains("audible inc")]),
    service("siriusxm", "SiriusXM", "music-audio", [
        contains("siriusxm"),
        contains("sirius xm"),
        contains("sirius radio"),
    ]),
    service("pandora", "Pandora", "music-audio", [
        exact("pandora"),
        contains("pandora music"),
        contains("pandora media"),
    ]),
];
const SOFTWARE = [
    service("microsoft-365", "Microsoft 365", "software", [
        contains("microsoft 365"),
        contains("msft 365"),
        contains("office 365"),
        contains("microsoft office"),
    ]),
    service("adobe", "Adobe Creative Cloud", "software", [
        contains("adobe creative cloud"),
        contains("adobe"),
    ]),
    service("1password", "1Password", "software", [contains("1password"), contains("agilebits")]),
    service("nordvpn", "NordVPN", "software", [contains("nordvpn"), contains("nord vpn")]),
    service("expressvpn", "ExpressVPN", "software", [
        contains("expressvpn"),
        contains("express vpn"),
    ]),
    service("canva", "Canva", "software", [contains("canva"), contains("canva pro")]),
    service("chatgpt-plus", "ChatGPT Plus", "software", [
        contains("chatgpt plus"),
        contains("chatgpt"),
        contains("openai chatgpt"),
    ]),
    service("duolingo", "Duolingo", "software", [contains("duolingo"), contains("duolingo plus")]),
    service("grammarly", "Grammarly", "software", [
        contains("grammarly"),
        contains("grammarly premium"),
    ]),
    service("linkedin-premium", "LinkedIn Premium", "software", [
        contains("linkedin premium"),
        contains("linkedin pre"),
    ]),
];
const CLOUD_STORAGE = [
    service("icloud", "iCloud+", "cloud-storage", [
        contains("icloud+"),
        contains("icloud"),
        contains("icloud storage"),
    ]),
    service("google-one", "Google One", "cloud-storage", [
        contains("google one"),
        contains("google storage"),
        contains("googleone"),
    ]),
    service("dropbox", "Dropbox", "cloud-storage", [contains("dropbox"), contains("dropbox plus")]),
];
const NEWS_READING = [
    service("new-york-times", "The New York Times", "news-reading", [
        contains("the new york times"),
        contains("new york times"),
        contains("nytimes"),
        contains("ny times"),
    ]),
    service("washington-post", "The Washington Post", "news-reading", [
        contains("the washington post"),
        contains("washington post"),
        contains("washingtonpost"),
    ]),
    service("wall-street-journal", "The Wall Street Journal", "news-reading", [
        contains("the wall street journal"),
        contains("wall street journal"),
        contains("wsj"),
    ]),
    service("the-economist", "The Economist", "news-reading", [
        contains("the economist"),
        contains("economist"),
    ]),
    service("the-guardian", "The Guardian", "news-reading", [
        contains("the guardian"),
        contains("guardian news"),
        contains("guardian media"),
    ]),
    service("medium", "Medium", "news-reading", [exact("medium"), contains("medium monthly")]),
    service("kindle-unlimited", "Kindle Unlimited", "news-reading", [
        contains("kindle unlimited"),
        contains("kindle unltd"),
        contains("kindleunlimited"),
    ]),
];
const FITNESS_WELLNESS = [
    service("peloton", "Peloton", "fitness-wellness", [
        contains("peloton"),
        contains("peloton interactive"),
    ]),
    service("strava", "Strava", "fitness-wellness", [contains("strava"), contains("strava inc")]),
    service("classpass", "ClassPass", "fitness-wellness", [
        contains("classpass"),
        contains("class pass"),
    ]),
    service("headspace", "Headspace", "fitness-wellness", [
        contains("headspace"),
        contains("headspace inc"),
    ]),
    service("calm", "Calm", "fitness-wellness", [exact("calm"), contains("calm app")]),
    service("planet-fitness", "Planet Fitness", "fitness-wellness", [
        contains("planet fitness"),
        contains("planet fit"),
        contains("planetfitness"),
    ]),
];
const FOOD_DELIVERY = [
    service("doordash-dashpass", "DashPass", "food-delivery", [
        contains("dashpass"),
        contains("doordash dashpass"),
    ]),
    service("uber-one", "Uber One", "food-delivery", [contains("uber one"), contains("uberone")]),
    service("grubhub-plus", "Grubhub+", "food-delivery", [
        contains("grubhub+"),
        contains("grubhub plus"),
        contains("grubhubplus"),
    ]),
    service("instacart-plus", "Instacart+", "food-delivery", [
        contains("instacart+"),
        contains("instacart plus"),
        contains("instacart express"),
    ]),
    service("deliveroo-plus", "Deliveroo Plus", "food-delivery", [
        contains("deliveroo plus"),
        contains("deliverooplus"),
    ]),
    service("hellofresh", "HelloFresh", "food-delivery", [
        contains("hellofresh"),
        contains("hello fresh"),
    ]),
];
const GAMING = [
    service("xbox-game-pass", "Xbox Game Pass", "gaming", [
        contains("xbox game pass"),
        contains("xbox gamepass"),
        contains("game pass"),
    ]),
    service("playstation-plus", "PlayStation Plus", "gaming", [
        contains("playstation plus"),
        contains("ps plus"),
        contains("playstationplus"),
    ]),
    service("nintendo-switch-online", "Nintendo Switch Online", "gaming", [
        contains("nintendo switch online"),
        contains("nintendo sw online"),
        contains("switch online"),
    ]),
    service("ea-play", "EA Play", "gaming", [contains("ea play"), contains("eaplay")]),
];
export const KNOWN_SERVICES = Object.freeze([
    ...VIDEO_STREAMING,
    ...MUSIC_AUDIO,
    ...SOFTWARE,
    ...CLOUD_STORAGE,
    ...NEWS_READING,
    ...FITNESS_WELLNESS,
    ...FOOD_DELIVERY,
    ...GAMING,
]);
const SERVICES_BY_ID = Object.freeze(new Map(KNOWN_SERVICES.map((entry) => [entry.serviceId, entry])));
/** Returns the Known service with this id, or `undefined`. */
export function getKnownService(serviceId) {
    return SERVICES_BY_ID.get(serviceId);
}
