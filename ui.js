/**
 * User interface functions for the comic downloader
 */

require('colors');
const readline = require('readline');
const Table = require('cli-table3');
const fs = require('fs-extra');
const { exec } = require('child_process');
const {
    CONFIG_FILE,
    DEFAULT_USER_AGENT,
    headers,
    cookieSource,
    userAgents,
    proxies,
    currentProxy,
    DIRECTORY
} = require('./fileUtils');
const { printCurrentStatus } = require('./download');
const { checkCookie, checkAllEndpoints } = require('./api');
const { getExistingFolders } = require('./fileUtils');
const { findNewIssues, findMissingIssues, processComic } = require('./download');

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let lastUpdateTime = null;

const printQuote = () => {
    const quoteData = require('./quote.json');
    console.log(quoteData.asciiArt.join('\n').green);
    console.log(quoteData.quoteText.join('\n').pink);
};

const askUser = (question) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim().toLowerCase());
        });
    });
};

const displayTable = (issues) => {
    const table = new Table({
        head: ['ID'.cyan, 'Title'.cyan, 'Disp Name'.cyan, 'Pub Date'.cyan, 'Pgs'.cyan, 'Str'.cyan, 'Desc'.cyan],
        colWidths: [7, 30, 30, 15, 6, 4, 30],
        wordWrap: true,
        wrapOnWordBoundary: true,
        style: { 'padding-left': 1, 'padding-right': 1 }
    });

    if (!issues || !Array.isArray(issues) || issues.length === 0) {
        console.log('No issues to display.'.yellow);
        return;
    }

    issues.forEach(issue => {
        table.push([
            (issue.id || 'N/A').toString().yellow,
            (issue.title || 'N/A').yellow,
            (issue.display_name || 'N/A').yellow,
            (issue.publication_date || 'N/A').yellow,
            (issue.page_count || 0).toString().yellow,
            (issue.story_count || 0).toString().yellow,
            (issue.description || 'N/A').yellow
        ]);
    });

    console.log(table.toString());
};

const changeUserAgent = async () => {
    console.log('\n=== Available User-Agents ==='.cyan);
    const table = new Table({
        head: ['ID'.cyan, 'User-Agent'.cyan, 'Lataamo Version'.cyan, 'Min SDK'.cyan, 'Target SDK'.cyan],
        colWidths: [5, 30, 15, 10, 10],
        wordWrap: true,
        wrapOnWordBoundary: true,
        style: { 'padding-left': 1, 'padding-right': 1 }
    });

    userAgents.forEach((ua, index) => {
        table.push([
            index.toString().yellow,
            ua.userAgent.yellow,
            (ua.lataamoVersion || 'N/A').yellow,
            (ua.minSdkVersion || 'N/A').yellow,
            (ua.targetSdkVersion || 'N/A').yellow
        ]);
    });

    console.log(table.toString());
    console.log(`Default User-Agent: ${DEFAULT_USER_AGENT}`.yellow);
    const choice = await askUser('Enter the ID of the User-Agent to use (or "default" for the default, "random" for a random one): '.cyan);
    let newUserAgent;
    if (choice === 'default') {
        newUserAgent = DEFAULT_USER_AGENT;
    } else if (choice === 'random') {
        newUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)].userAgent;
    } else if (!isNaN(choice) && choice >= 0 && choice < userAgents.length) {
        newUserAgent = userAgents[parseInt(choice)].userAgent;
    } else {
        console.log('Invalid choice. Keeping current User-Agent.'.red);
        return;
    }

    headers['User-Agent'] = newUserAgent;
    await fs.writeJson(CONFIG_FILE, { cookie: headers['Cookie'], userAgent: newUserAgent }, { spaces: 2 });
    console.log(`User-Agent updated to: ${newUserAgent}`.green);
    await printCurrentStatus();
};

const updateCookieManually = async () => {
    console.log('\n=== Update SMF Cookie ==='.cyan);
    const newCookie = await askUser('Enter new SMF cookie (e.g., "smf=84d7b2172625276e241a759e5c4f88c6; logged_in=1") or type "exit" to exit: '.cyan);
    if (newCookie === 'exit') {
        console.log('Exited successfully.'.green);
        rl.close();
        process.exit(0);
    }
    if (newCookie.match(/smf=[a-f0-9]{32}; logged_in=1/)) {
        headers['Cookie'] = newCookie;
        await fs.writeJson(CONFIG_FILE, { cookie: newCookie, userAgent: headers['User-Agent'] }, { spaces: 2 });
        console.log('Cookie updated successfully.'.green);
        cookieSource = 'file (config.json)';
        await printCurrentStatus();
    } else {
        console.log('Invalid cookie format. Must be like "smf=84d7b2172625276e241a759e5c4f88c6; logged_in=1".'.red);
    }
};

const selectProxy = async () => {
    console.log('\n=== Available Proxies ==='.cyan);
    if (proxies.length === 0) {
        console.log('No proxies found in proxies.json. Please add some proxies to use this feature.'.red);
        return;
    }

    let startIndex = 0;
    let endIndex = Math.min(10, proxies.length);

    const displayProxies = (start, end) => {
        const table = new Table({
            head: ['ID'.cyan, 'Host'.cyan, 'Port'.cyan, 'Description'.cyan],
            colWidths: [5, 20, 10, 30],
            wordWrap: true,
            wrapOnWordBoundary: true,
            style: { 'padding-left': 1, 'padding-right': 1 }
        });

        proxies.slice(start, end).forEach(proxy => {
            const port = proxy.port !== null && proxy.port !== undefined ? proxy.port.toString().yellow : "N/A".red;
            const host = proxy.host && proxy.host !== "http" && proxy.host !== "socks4" && proxy.host !== "socks5" ? proxy.host.yellow : "INVALID".red;
            const description = proxy.description || "No description";
            table.push([
                proxy.id.toString().yellow,
                host,
                port,
                description.yellow
            ]);
        });

        console.log(table.toString());
        console.log(`Showing proxies ${start + 1} to ${end} of ${proxies.length}`.yellow);
    };

    while (true) {
        displayProxies(startIndex, endIndex);
        const choice = await askUser('Enter the ID of the proxy to use (or "none" to disable proxy): '.cyan);

        if (choice === 'none') {
            currentProxy = null;
            console.log('Proxy disabled. Using direct connection.'.green);
            await printCurrentStatus();
            break;
        }

        const selectedId = parseInt(choice);
        const selectedProxy = proxies.find(proxy => proxy.id === selectedId);

        if (selectedProxy && selectedProxy.port !== null && selectedProxy.port !== undefined &&
            selectedProxy.host && selectedProxy.host !== "http" && selectedProxy.host !== "socks4" && selectedProxy.host !== "socks5") {
            currentProxy = selectedProxy;
            console.log(`Proxy set to: ${currentProxy.host}:${currentProxy.port} - ${currentProxy.description}`.green);
            await printCurrentStatus();
            break;
        } else if (isNaN(selectedId) || !proxies.some(proxy => proxy.id === selectedId)) {
            if (endIndex < proxies.length) {
                const showMore = await askUser('Invalid ID or not in this list. Show next 10 proxies? (yes/no): '.cyan);
                if (showMore === 'yes' || showMore === 'y') {
                    startIndex += 10;
                    endIndex = Math.min(endIndex + 10, proxies.length);
                } else {
                    console.log('Returning to main menu.'.yellow);
                    break;
                }
            } else {
                console.log('No more proxies to show. Invalid choice, keeping current proxy setting.'.red);
                break;
            }
        } else {
            console.log('Selected proxy is invalid (missing port or invalid host). Please choose another.'.red);
        }
    }
};

const convertToPdf = async () => {
    console.log('\n=== PDF Conversion Options ==='.cyan);
    console.log('[1] Newest issues downloaded today'.yellow);
    console.log('[2] Specific issue IDs'.yellow);
    console.log('[3] All downloaded issues'.yellow);
    const choice = await askUser('Select an option (1-3): '.cyan);

    let command;
    if (choice === '1') {
        command = 'python pdfconverter.py newest';
    } else if (choice === '2') {
        const ids = await askUser('Enter issue IDs (space-separated, e.g., 5559 5560): '.cyan);
        command = `python pdfconverter.py ids ${ids}`;
    } else if (choice === '3') {
        command = 'python pdfconverter.py all';
    } else {
        console.log('Invalid choice. Returning to main menu.'.red);
        return;
    }

    console.log(`Running: ${command}`.yellow);
    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error converting to PDF: ${err.message}`.red);
            console.error(stderr.red);
            return;
        }
        console.log(stdout.green);
        if (stderr) console.error(stderr.red);
    });
};

const showMenu = async () => {
    const menuItems = [
        "Download from ID",
        "Check newest issues from API",
        "Check IDs in /comics folder",
        "Check if SMF cookie has expired",
        "Print newest issues: updated " + (lastUpdateTime ? timeAgo(lastUpdateTime) : 'never') + " ago",
        "Convert Issues into PDF",
        "Use different User-Agent",
        "Update SMF Cookie",
        "Exit",
        "Select Proxy",
        "Disable/Reset Proxy"
    ];

    let selectedIndex = 0;
    let menuActive = true;

    const displayMenu = async () => {
        console.clear();
        printQuote();
        await printCurrentStatus();
        console.log('\n=== Selection Menu ==='.green);
        menuItems.forEach((item, index) => {
            const prefix = index === selectedIndex ? '> ' : '  ';
            console.log(`${prefix}[${index + 1}] ${item}`.cyan);
        });
        console.log('\nUse arrow keys to navigate, Enter to select, Ctrl+C to exit'.yellow);
    };

    await displayMenu();

    return new Promise((resolve) => {
        process.stdin.on('keypress', async (str, key) => {
            if (!menuActive) return;

            if (key.ctrl && key.name === 'c') {
                console.log('Exiting.'.green);
                rl.close();
                process.exit(0);
            }

            switch(key.name) {
                case 'up':
                    selectedIndex = Math.max(0, selectedIndex - 1);
                    await displayMenu();
                    break;
                case 'down':
                    selectedIndex = Math.min(menuItems.length - 1, selectedIndex + 1);
                    await displayMenu();
                    break;
                case 'return':
                    menuActive = false;
                    console.clear();
                    await handleSelection((selectedIndex + 1).toString());
                    console.clear();
                    await displayMenu();
                    menuActive = true;
                    break;
            }
        });
    });

    async function handleSelection(choice) {
        if (choice === '1') {
            await fs.ensureDir(DIRECTORY);
            const apiIssues = await checkAllEndpoints();
            const startIdInput = await askUser('Start download from specific ID: '.cyan);
            const startId = parseInt(startIdInput);
            if (isNaN(startId) || startId <= 0) {
                console.log('Invalid ID. Please enter a positive number.'.red);
                return;
            }
            const isCookieValid = await checkCookie(startId);
            if (!isCookieValid) {
                console.log('Cannot proceed with download due to invalid cookie.'.red);
                return;
            }
            const issuesToDownload = apiIssues.filter(issue => issue.id >= startId);
            if (issuesToDownload.length === 0) {
                console.log(`No issues found with ID >= ${startId}.`.yellow);
                return;
            }
            console.log(`Found ${issuesToDownload.length} issues with ID >= ${startId}.`.green);
            console.log('Issues to download:'.green);
            displayTable(issuesToDownload);
            const downloadConfirm = await askUser('Do you want to download these issues? (yes/no): '.cyan);
            if (downloadConfirm === 'yes' || downloadConfirm === 'y') {
                console.log('Proceeding to download issues...'.green);
                const startTime = new Date();
                const totalIssues = issuesToDownload.length;
                let processedIssues = 0;

                for (let issue of issuesToDownload) {
                    await processComic(issue.id, startTime, totalIssues, ++processedIssues);
                    await fs.writeJson(path.join(__dirname, 'progress.json'), { lastIssue: issue.id }, { spaces: 2 });
                }
                console.log(`Finished downloading ${totalIssues} issues.`.green);
            }
        } else if (choice === '2') {
            await fs.ensureDir(DIRECTORY);
            const apiIssues = await checkAllEndpoints();
            const existingFolders = await getExistingFolders();
            const newIssues = await findNewIssues(apiIssues, existingFolders);
            if (newIssues.length > 0) {
                const downloadNew = await askUser('Do you want to download the newest issues? (yes/no): '.cyan);
                if (downloadNew === 'yes' || downloadNew === 'y') {
                    console.log('Proceeding to download new issues...'.green);
                    const startTime = new Date();
                    const totalIssues = newIssues.length;
                    let processedIssues = 0;

                    for (let issue of newIssues) {
                        await processComic(issue.id, startTime, totalIssues, ++processedIssues);
                        await fs.writeJson(path.join(__dirname, 'progress.json'), { lastIssue: issue.id }, { spaces: 2 });
                    }
                }
            }
        } else if (choice === '3') {
            const apiIssues = await checkAllEndpoints();
            const existingFolders = await getExistingFolders();
            const missingIssues = await findMissingIssues(apiIssues, existingFolders);
            if (missingIssues.length > 0) {
                const downloadMissing = await askUser('Do you want to download the missing issues? (yes/no): '.cyan);
                if (downloadMissing === 'yes' || downloadMissing === 'y') {
                    console.log('Proceeding to download missing issues...'.green);
                    const startTime = new Date();
                    const totalIssues = missingIssues.length;
                    let processedIssues = 0;

                    for (let issue of missingIssues) {
                        await processComic(issue.id, startTime, totalIssues, ++processedIssues);
                        await fs.writeJson(path.join(__dirname, 'progress.json'), { lastIssue: issue.id }, { spaces: 2 });
                    }
                }
            }
        } else if (choice === '4') {
            await checkCookie();
        } else if (choice === '5') {
            if (!lastUpdateTime) {
                console.log('No issues have been checked yet. Please select option [2] first.'.red);
            } else {
                const apiIssues = await checkAllEndpoints();
                const existingFolders = await getExistingFolders();
                const newIssues = await findNewIssues(apiIssues, existingFolders);
                console.log(`Newest issues updated ${timeAgo(lastUpdateTime)} ago:`.yellow);
                displayTable(newIssues);
            }
        } else if (choice === '6') {
            await convertToPdf();
        } else if (choice === '7') {
            await changeUserAgent();
        } else if (choice === '8') {
            await updateCookieManually();
        } else if (choice === '9') {
            console.log('Exiting.'.green);
            rl.close();
            process.exit(0);
        } else if (choice === '10') {
            await selectProxy();
        } else if (choice === '11') {
            currentProxy = null;
            console.log('Proxy disabled/reset successfully. Using direct connection.'.green);
            await printCurrentStatus();
        }
    }
};

const timeAgo = (date) => {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours`;
    const days = Math.floor(hours / 24);
    return `${days} days`;
};

module.exports = {
    showMenu,
    printQuote,
    askUser,
    displayTable,
    changeUserAgent,
    updateCookieManually,
    selectProxy,
    convertToPdf,
    lastUpdateTime
};