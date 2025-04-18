/**
 * File operation utilities for the comic downloader
 */

const fs = require('fs-extra');
const path = require('path');
const {
    DIRECTORY,
    LOG_FILE,
    CONFIG_FILE,
    USER_AGENTS_FILE,
    PROXIES_FILE,
    DEFAULT_COOKIE,
    DEFAULT_USER_AGENT
} = require('./constants');

let headers = {};
let currentProxy = null;
let cookieSource = '';
let userAgents = [];
let proxies = [];

const loadConfig = async () => {
    try {
        userAgents = fs.readJsonSync(USER_AGENTS_FILE);
    } catch (e) {
        console.log(`Error loading userAgents.json: ${e.message}`.red);
        userAgents = [{ userAgent: DEFAULT_USER_AGENT }];
    }

    try {
        proxies = fs.readJsonSync(PROXIES_FILE);
    } catch (e) {
        console.log('proxies.json not found. No proxies loaded.'.yellow);
        proxies = [];
    }

    if (fs.existsSync(CONFIG_FILE)) {
        const config = fs.readJsonSync(CONFIG_FILE);
        headers = {
            'User-Agent': config.userAgent || DEFAULT_USER_AGENT,
            'Host': 'api.akuankka.fi',
            'Connection': 'Keep-Alive',
            'Accept-Encoding': 'gzip',
            'Cookie': config.cookie || DEFAULT_COOKIE
        };
        cookieSource = config.cookie ? 'file (config.json)' : 'hardcoded default';
    } else {
        headers = {
            'User-Agent': DEFAULT_USER_AGENT,
            'Host': 'api.akuankka.fi',
            'Connection': 'Keep-Alive',
            'Accept-Encoding': 'gzip',
            'Cookie': DEFAULT_COOKIE
        };
        fs.writeJsonSync(CONFIG_FILE, { cookie: DEFAULT_COOKIE, userAgent: DEFAULT_USER_AGENT }, { spaces: 2 });
        cookieSource = 'hardcoded default';
    }
};

const getExistingFolders = async () => {
    try {
        const files = await fs.readdir(DIRECTORY);
        const directories = files.filter(file => fs.statSync(path.join(DIRECTORY, file)).isDirectory());
        const folderData = [];

        for (let dir of directories) {
            const jsonPath = path.join(DIRECTORY, dir, 'issue.json');
            if (fs.existsSync(jsonPath)) {
                const json = await fs.readJson(jsonPath);
                folderData.push({ id: json.id, publication_date: json.publication_date });
            }
        }
        return folderData;
    } catch (e) {
        console.log(`Error reading folders: ${e.message}`.red);
        return [];
    }
};

const logDownload = async (issue) => {
    try {
        const now = new Date().toISOString().replace('T', ' ').split('.')[0];
        let log = [];
        if (fs.existsSync(LOG_FILE)) {
            log = await fs.readJson(LOG_FILE);
        }
        log.push({ issue, date: now });
        await fs.writeJson(LOG_FILE, log, { spaces: 2 });
    } catch (e) {
        console.log(`Error logging download: ${e.message}`.red);
    }
};

module.exports = {
    loadConfig,
    getExistingFolders,
    logDownload,
    headers,
    currentProxy,
    cookieSource,
    userAgents,
    proxies
};