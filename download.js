/**
 * Download-related functions for the comic downloader
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { DIRECTORY, BASE_URL, headers, currentProxy } = require('./constants');
const { fetchComicData } = require('./api');
const { logDownload } = require('./fileUtils');
const { displayTable, askUser } = require('./ui');

const downloadComic = async (issueNum) => {
    const comicDir = path.join(DIRECTORY, issueNum.toString());
    const cachePath = path.join(comicDir, 'issue.json');
    if (fs.existsSync(cachePath)) {
        console.log('Reading from cache'.magenta);
        return require(cachePath);
    } else {
        const data = await fetchComicData(issueNum);
        if (data) {
            await fs.ensureDir(comicDir);
            await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
        }
        return data;
    }
};

const processComic = async (issueNum, startTime, totalIssues, processedIssues) => {
    const updateInterval = 1000;
    let lastUpdate = Date.now();

    const updateProgress = () => {
        const currentTime = new Date();
        const elapsedTime = (currentTime - startTime) / 1000;
        const averageTimePerComic = elapsedTime / processedIssues;
        const remainingIssues = totalIssues - processedIssues;
        const etaSeconds = remainingIssues * averageTimePerComic;

        const etaHours = Math.floor(etaSeconds / 3600);
        const etaMinutes = Math.floor((etaSeconds % 3600) / 60);
        const etaSecondsRemaining = Math.floor(etaSeconds % 60);

        console.log(`[${processedIssues}/${totalIssues}] Starting download...`.green);
        console.log(`Processing Comic #${issueNum.toString().blue}`);
        console.log(`ETA: ${etaHours}h ${etaMinutes}m ${etaSecondsRemaining}s`.cyan);
    };

    updateProgress();

    await fs.ensureDir(path.join(DIRECTORY, issueNum.toString()));
    const comic = await downloadComic(issueNum);
    if (!comic) return;

    console.log(`Downloading ${comic.story_count.toString().blue} Stories...`.green);

    for (let storyIndex in comic.stories) {
        const story = comic.stories[storyIndex];
        const storyPrefix = `Story_${parseInt(storyIndex) + 1}`;
        console.log(`Downloading ${storyPrefix.yellow}: "${story.title.yellow}" with ${story.pages.length.toString().blue} pages`.green);

        for (let pageIndex in comic.stories[storyIndex].pages) {
            const page = comic.stories[storyIndex].pages[pageIndex];
            const pagePrefix = `${storyPrefix}-Page_${parseInt(pageIndex) + 1}`;
            const imageVersionKeys = Object.keys(page.images || {});
            console.log(`Found ${imageVersionKeys.length.toString().red} images for ${pagePrefix.yellow}`.red);

            for (let imageIndex in imageVersionKeys) {
                const imageKey = imageVersionKeys[imageIndex];
                console.log(`Attempting Image Version ${imageKey.yellow}`.red);
                const url = BASE_URL + page.images[imageKey].url;
                let imageData;
                try {
                    imageData = await downloadWithRetry(url, issueNum, storyIndex, pageIndex);
                } catch (e) {
                    if (e.response?.status === 401) {
                        console.log(`Skipping ${url} due to 401 Unauthorized`.yellow);
                        continue;
                    }
                    console.log(`Failed to download ${url} after retries`.red);
                    continue;
                }

                const savePath = path.join(DIRECTORY, issueNum.toString(), storyPrefix, `Page_${parseInt(pageIndex) + 1}`);
                await fs.ensureDir(savePath);
                await fs.writeFile(path.join(savePath, `${issueNum}_${parseInt(storyIndex) + 1}_${parseInt(pageIndex) + 1}_${imageKey}${path.extname(url)}`), imageData);
            }
        }
    }

    if (Date.now() - lastUpdate >= updateInterval) {
        updateProgress();
        lastUpdate = Date.now();
    }

    await logDownload(issueNum);
};

const downloadWithRetry = async (url, issueNum, storyIndex, pageIndex, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const axiosConfig = { headers, responseType: 'arraybuffer' };
            if (currentProxy) {
                axiosConfig.proxy = { host: currentProxy.host, port: currentProxy.port };
            }
            const response = await axios.get(url, axiosConfig);
            return response.data;
        } catch (e) {
            console.log(`Attempt ${i + 1}/${retries} failed for ${url}: ${e.message}`.red);
            if (i === retries - 1) {
                await fs.appendFile('errors.txt', `Issue ${issueNum}, Story ${storyIndex}, Page ${pageIndex}, URL: ${url} - ${e.message}\r\n`);
                throw e;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

const findNewIssues = async (apiIssues, existingFolders) => {
    if (existingFolders.length === 0) {
        console.log('No existing folders found. All checked issues are new.'.yellow);
        console.log(`Found`.green + `${apiIssues.length}`.white + `new issues.`.green);
        const showTable = await askUser('Do you want to see the table of new issues? (yes/no): '.cyan);
        if (showTable === 'yes' || showTable === 'y') displayTable(apiIssues);
        return apiIssues;
    }

    const latestFolder = existingFolders.reduce((latest, current) => {
        return current.id > latest.id ? current : latest;
    }, existingFolders[0]);

    console.log(`Latest downloaded issue: ID ${latestFolder.id}, Publication Date: ${latestFolder.publication_date}`.blue);

    const newIssues = apiIssues.filter(issue => issue.id > latestFolder.id);

    if (newIssues.length > 0) {
        console.log(`Found ${newIssues.length} new issues.`.green);
        const showTable = await askUser('Do you want to see the table of new issues? (yes/no): '.cyan);
        if (showTable === 'yes' || showTable === 'y') {
            console.log(`New issues with IDs greater than ${latestFolder.id}:`.green);
            displayTable(newIssues);
        }
    } else {
        console.log(`No issues with IDs greater than ${latestFolder.id} found.`.green);
    }

    return newIssues;
};

const findMissingIssues = async (apiIssues, existingFolders) => {
    const existingIds = new Set(existingFolders.map(folder => folder.id));
    const missingIssues = apiIssues.filter(issue => !existingIds.has(issue.id));

    console.log(`You are missing ${missingIssues.length} issues from your comics folder.`.yellow);
    if (missingIssues.length === 0) return missingIssues;

    let saveList;
    const showFirstTen = await askUser('Do you want to see the first 10 missing issues? (yes/no): '.cyan);
    if (showFirstTen === 'yes' || showFirstTen === 'y') {
        console.log(`First 10 missing issues:`.green);
        displayTable(missingIssues.slice(0, 10));

        if (missingIssues.length > 10) {
            const showNextFifty = await askUser('Do you want to see the next 50 missing issues? (yes/no): '.cyan);
            if (showNextFifty === 'yes' || showNextFifty === 'y') {
                console.log(`Next 50 missing issues (11-60):`.green);
                displayTable(missingIssues.slice(10, 60));

                if (missingIssues.length > 60) {
                    const showAnotherFifty = await askUser('Do you want to see another 50 missing issues? (yes/no): '.cyan);
                    if (showAnotherFifty === 'yes' || showAnotherFifty === 'y') {
                        console.log(`Next 50 missing issues (61-110):`.green);
                        displayTable(missingIssues.slice(60, 110));
                    }
                    saveList = await askUser('Do you want to save the full list of missing issues to a file? (yes/no): '.cyan);
                } else {
                    saveList = await askUser('Do you want to save the full list of missing issues to a file? (yes/no): '.cyan);
                }
            } else {
                saveList = await askUser('Do you want to save the full list of missing issues to a file? (yes/no): '.cyan);
            }
        } else {
            saveList = await askUser('Do you want to save the full list of missing issues to a file? (yes/no): '.cyan);
        }
    } else {
        saveList = await askUser('Do you want to save the full list of missing issues to a file? (yes/no): '.cyan);
    }

    if (saveList === 'yes' || saveList === 'y') {
        await fs.writeJson(path.join(__dirname, 'missing_issues.json'), missingIssues, { spaces: 2 });
        console.log('Missing issues saved to missing_issues.json'.green);
    }

    return missingIssues;
};

const printCurrentStatus = async () => {
    const { checkCookieStatus } = require('./api');
    const cookieStatus = await checkCookieStatus();
    console.log(`Using User-Agent: ${headers['User-Agent']}`.yellow);
    console.log(`Using SMF cookie from: ${cookieSource} ${cookieStatus}`.yellow);
    console.log(`Proxy Status: ${currentProxy ? `On (${currentProxy.host}:${currentProxy.port})` : 'Off'}`.yellow);
};

module.exports = {
    downloadComic,
    processComic,
    findNewIssues,
    findMissingIssues,
    printCurrentStatus
};