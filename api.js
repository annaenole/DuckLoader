/**
 * API-related functions for fetching comic data
 */

const axios = require('axios');
const { BASE_URL, API_URLS } = require('./constants');
const { headers, currentProxy } = require('./fileUtils');

const fetchComicData = async (issueNum) => {
    try {
        const axiosConfig = { headers };
        if (currentProxy) {
            axiosConfig.proxy = { host: currentProxy.host, port: currentProxy.port };
        }
        const response = await axios.get(`${BASE_URL}/api/v2/issues/${issueNum}?stories-full=1`, axiosConfig);
        return response.data;
    } catch (e) {
        console.log(`Error fetching comic ${issueNum}: ${e.message}`.red);
        throw e;
    }
};

const checkAllEndpoints = async () => {
    const allIssues = [];
    for (let i = 0; i < API_URLS.length; i++) {
        console.log(`Checking API endpoint ${i + 1} (${API_URLS[i].name})...`.green);
        try {
            const axiosConfig = { headers, responseType: 'json' };
            if (currentProxy) {
                axiosConfig.proxy = { host: currentProxy.host, port: currentProxy.port };
            }
            const response = await axios.get(API_URLS[i].url, axiosConfig);
            console.log(`Response status for endpoint ${i + 1}: ${response.status}`.green);
            console.log(`Response data type for endpoint ${i + 1}: ${typeof response.data}`.blue);
            console.log(`Response data (first 100 chars) for endpoint ${i + 1}: ${JSON.stringify(response.data).substring(0, 100)}...`.green);

            const issues = response.data.items;
            if (issues && Array.isArray(issues)) {
                console.log(`Found ${issues.length} issues from ${API_URLS[i].name}`.green);
                issues.forEach(issue => {
                    allIssues.push({
                        id: issue.id,
                        title: issue.title || 'N/A',
                        display_name: issue.display_name || 'N/A',
                        publication_date: issue.publication_date || 'N/A',
                        page_count: issue.page_count || 0,
                        story_count: issue.story_count || 0,
                        description: issue.description || 'N/A'
                    });
                });
            } else {
                console.log(`No valid issue array found in endpoint ${i + 1}.`.red);
            }
        } catch (e) {
            console.log(`Error checking endpoint ${i + 1}: ${e.message}`.red);
            if (e.response) {
                console.log(`Error response status: ${e.response.status}`.yellow);
                console.log(`Error response data:`.yellow, JSON.stringify(e.response.data, null, 2));
            }
        }
    }
    return Array.from(new Map(allIssues.map(issue => [issue.id, issue])).values());
};

const checkCookieStatus = async () => {
    const randomPubIndex = Math.floor(Math.random() * API_URLS.length);
    const selectedPub = API_URLS[randomPubIndex];
    try {
        const axiosConfig = { headers, responseType: 'json' };
        if (currentProxy) {
            axiosConfig.proxy = { host: currentProxy.host, port: currentProxy.port };
        }
        const response = await axios.get(selectedPub.url, axiosConfig);
        const issues = response.data.items;
        if (!issues || !Array.isArray(issues) || issues.length === 0) {
            console.log('No issues found for cookie check.'.red);
            return '(No issues)';
        }

        const issueId = issues[Math.floor(Math.random() * issues.length)].id;
        console.log(`Testing cookie with issue ID: ${issueId}`.yellow);
        const issueData = await fetchComicData(issueId);
        if (!issueData?.stories?.length || !issueData.stories[0]?.pages?.length) {
            console.log(`No valid stories/pages for issue ${issueId}.`.red);
            return '(No stories)';
        }

        const storyUrl = BASE_URL + issueData.stories[0].pages[0].images[Object.keys(issueData.stories[0].pages[0].images)[0]].url;
        console.log(`Testing image URL: ${storyUrl}`.yellow);
        const imageAxiosConfig = { headers, responseType: 'arraybuffer' };
        if (currentProxy) {
            imageAxiosConfig.proxy = { host: currentProxy.host, port: currentProxy.port };
        }
        const responseImage = await axios.get(storyUrl, imageAxiosConfig);

        return responseImage.status === 200 ? '(200, Alive)' : `(${responseImage.status}, Unknown)`;
    } catch (e) {
        console.log(`Cookie check error: ${e.message}`.red);
        if (e.response) {
            console.log(`Status: ${e.response.status}`.yellow);
            return e.response.status === 403 ? '(403, Expired)' : e.response.status === 401 ? '(401, Unauthorized)' : '(Unknown)';
        }
        return '(Unknown)';
    }
};

const checkCookie = async (testIssueId = null) => {
    console.log('Checking SMF cookie validity...'.cyan);
    const randomPubIndex = Math.floor(Math.random() * API_URLS.length);
    const selectedPub = API_URLS[randomPubIndex];
    console.log(`Selected publication: ${selectedPub.name}`.yellow);

    try {
        const axiosConfig = { headers, responseType: 'json' };
        if (currentProxy) {
            axiosConfig.proxy = { host: currentProxy.host, port: currentProxy.port };
        }
        const response = await axios.get(selectedPub.url, axiosConfig);
        const issues = response.data.items;
        if (!issues || !Array.isArray(issues) || issues.length === 0) {
            console.log('No issues found. Cookie check inconclusive.'.red);
            return false;
        }

        // Use provided issue ID or select a recent issue
        let issueId;
        if (testIssueId && issues.some(issue => issue.id === testIssueId)) {
            issueId = testIssueId;
        } else {
            const recentIssues = issues.filter(issue => issue.id >= issues[0].id - 50).sort((a, b) => b.id - a.id);
            issueId = recentIssues[0]?.id || issues[Math.floor(Math.random() * issues.length)].id;
        }
        console.log(`Testing with issue ID: ${issueId}`.yellow);

        const issueData = await fetchComicData(issueId);
        if (!issueData || !issueData.stories?.length || !issueData.stories[0].pages?.length) {
            console.log(`No valid stories/pages for issue ${issueId}. Cookie check inconclusive.`.red);
            return false;
        }

        const storyUrl = BASE_URL + issueData.stories[0].pages[0].images[Object.keys(issueData.stories[0].pages[0].images)[0]].url;
        console.log(`Testing image URL: ${storyUrl}`.yellow);
        const imageAxiosConfig = { headers, responseType: 'arraybuffer' };
        if (currentProxy) {
            imageAxiosConfig.proxy = { host: currentProxy.host, port: currentProxy.port };
        }
        const responseImage = await axios.get(storyUrl, imageAxiosConfig);

        if (responseImage.status === 200) {
            console.log(`Cookie is valid (status: ${responseImage.status}).`.green);
            return true;
        } else {
            console.log(`Image access failed (status: ${responseImage.status}).`.red);
            return false;
        }
    } catch (e) {
        console.log(`Cookie check error: ${e.message}`.red);
        if (e.response) {
            console.log(`Status: ${e.response.status}, Data: ${JSON.stringify(e.response.data || {})}`.yellow);
            if (e.response.status === 401 || e.response.status === 403) {
                console.log(`No permission to access content. Cookie may be invalid or subscription restricted.`.red);
                const newCookie = await askUser('Enter new SMF cookie (e.g., "smf=84d7b2172625276e241a759e5c4f88c6; logged_in=1") or type "exit" to exit: '.cyan);
                if (newCookie === 'exit') {
                    console.log('Exited successfully.'.green);
                    rl.close();
                    process.exit(0);
                }
                if (newCookie.match(/smf=[a-f0-9]{32}; logged_in=1/)) {
                    headers['Cookie'] = newCookie;
                    fs.writeJsonSync(CONFIG_FILE, { cookie: newCookie, userAgent: headers['User-Agent'] }, { spaces: 2 });
                    console.log('Cookie updated successfully.'.green);
                    cookieSource = 'file (config.json)';
                    await printCurrentStatus();
                    return true;
                } else {
                    console.log('Invalid cookie format. Must be like "smf=84d7b2172625276e241a759e5c4f88c6; logged_in=1".'.red);
                    return false;
                }
            }
        }
        return false;
    }
};

module.exports = { fetchComicData, checkAllEndpoints, checkCookieStatus, checkCookie };