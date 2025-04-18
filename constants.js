/**
 * Constants for the comic downloader
 */

const path = require('path');

module.exports = {
    BASE_URL: 'https://www.akuankka.fi',
    DEFAULT_COOKIE: 'smf=d2230f2c18438204a682043ca8735d05; logged_in=1',
    DEFAULT_USER_AGENT: 'lataamo-android/225 Dalvik/2.1.0 (Linux; U; Android 13; SM-S911B Build/TP1A.220624.014) Mobile',
    DIRECTORY: path.join(__dirname, 'comics'),
    LOG_FILE: path.join(__dirname, 'download_log.json'),
    CONFIG_FILE: path.join(__dirname, 'config.json'),
    USER_AGENTS_FILE: path.join(__dirname, 'userAgents.json'),
    PROXIES_FILE: path.join(__dirname, 'proxies.json'),
    API_URLS: [
        { url: 'https://api.akuankka.fi/api/v2/issues?publication=1&limit=6000&offset=0&order=-published_start', name: 'Aku Ankka -lehdet' },
        { url: 'https://api.akuankka.fi/api/v2/issues?publication=2&limit=6000&offset=0&order=-published_start', name: 'Aku Ankka Extra' },
        { url: 'https://api.akuankka.fi/api/v2/issues?publication=3&limit=6000&offset=0&order=-published_start', name: 'Ankkalinnan Ajankohtaiset - Ilmaiset' },
        { url: 'https://api.akuankka.fi/api/v2/issues?publication=4&limit=6000&offset=0&order=-published_start', name: 'Aku Ankan Taskukirjat' },
        { url: 'https://api.akuankka.fi/api/v2/issues?publication=5&limit=6000&offset=0&order=-published_start', name: 'Roope-Sedät' }
    ]
};