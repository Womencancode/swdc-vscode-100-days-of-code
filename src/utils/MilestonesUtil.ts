import { getSoftwareDir, isWindows, compareDates, getSoftwareSessionAsJson } from "./Util";
import fs = require("fs");
import { window, commands } from "vscode";
import path = require("path");
import { updateLogsMilestonesAndMetrics, getDayNumberFromDate, setDailyMilestonesByDayNumber } from "./LogsUtil";
import { User } from "../models/User";
import { getUserObject, updateUserMilestones, incrementUserShare, updateUserLanguages } from "./UserUtil";
import { getSessionCodetimeMetrics } from "./MetricUtil";
import { getLanguages } from "./LanguageUtil";
import { softwarePost, isResponseOk, serverIsAvailable, softwarePut, softwareGet } from "../managers/HttpManager";

export let updatedMilestonesDb = true;
export let sentMilestonesDb = true;

let toCreateMilestones: Array<any> = [];
let toUpdateMilestones: Array<any> = [];

export function getMilestonesJson(): string {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\milestones.json";
    } else {
        file += "/milestones.json";
    }
    return file;
}

function getMilestonesPayloadJson(): string {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\milestonesPayload.json";
    } else {
        file += "/milestonesPayload.json";
    }
    return file;
}

export function createMilestonesPayloadJson() {
    const filepath = getMilestonesPayloadJson();
    const fileData = {
        updatedMilestonesDb,
        sentMilestonesDb,
        toCreateMilestones,
        toUpdateMilestones
    };
    try {
        fs.writeFileSync(filepath, JSON.stringify(fileData, null, 4));
        console.log("Created file");
    } catch (err) {
        console.log(err);
    }
}

export function checkMilestonesPayload() {
    const filepath = getMilestonesPayloadJson();
    try {
        if (fs.existsSync(filepath)) {
            const payloadData = JSON.parse(fs.readFileSync(filepath).toString());
            updatedMilestonesDb = payloadData["updatedMilestonesDb"];
            sentMilestonesDb = payloadData["sentMilestonesDb"];
            toCreateMilestones = payloadData["toCreateMilestones"];
            toUpdateMilestones = payloadData["toUpdateMilestones"];
        }
    } catch (err) {
        console.log(err);
    }
}

export function checkMilestonesJson(): boolean {
    const filepath = getMilestonesJson();
    try {
        if (fs.existsSync(filepath)) {
            return true;
        } else {
            const src = path.join(__dirname, "../assets/milestones.json");
            fs.copyFileSync(src, filepath);
            return true;
        }
    } catch (err) {
        return false;
    }
}

export async function fetchMilestonesByDate(date: number) {
    // End Date is 11:59 pm
    let endDate = new Date(date);
    endDate.setHours(23, 59, 59, 0);

    // Start Date is 12:01 am
    let startDate = new Date(endDate.valueOf() - 68400000);
    startDate.setHours(0, 0, 1, 0);

    let retry = 5;
    let available = false;
    while (retry > 0) {
        try {
            available = await serverIsAvailable();
        } catch (err) {
            available = false;
        }
        retry--;
        if (available) {
            const jwt = getSoftwareSessionAsJson()["jwt"];
            const milestones = await softwareGet(
                `100doc/milestones?start_date=${Math.round(startDate.valueOf() / 1000)}&end_date=${Math.round(
                    endDate.valueOf() / 1000
                )}`,
                jwt
            ).then(resp => {
                if (isResponseOk(resp)) {
                    return resp.data;
                }
            });
            if (milestones) {
                retry = 0;
                return milestones;
            }
        } else {
            // Wait 10 seconds before next try
            setTimeout(() => {}, 10000);
        }
    }
}

export async function fetchMilestonesForYesterdayAndToday() {
    // End Date is 11:59 pm today
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 0);

    // Start Date is 12:01 am yesterday
    let startDate = new Date(endDate.valueOf() - 68400000 * 2);
    startDate.setHours(0, 0, 1, 0);

    let retry = 5;
    let available = false;
    while (retry > 0) {
        try {
            available = await serverIsAvailable();
        } catch (err) {
            available = false;
        }
        retry--;
        if (available) {
            const jwt = getSoftwareSessionAsJson()["jwt"];
            const milestones = await softwareGet(
                `100doc/milestones?start_date=${Math.round(startDate.valueOf() / 1000)}&end_date=${Math.round(
                    endDate.valueOf() / 1000
                )}`,
                jwt
            ).then(resp => {
                if (isResponseOk(resp)) {
                    return resp.data;
                }
            });
            if (milestones) {
                retry = 0;
                compareWithLocalMilestones(milestones);
            }
        } else {
            // Wait 10 seconds before next try
            setTimeout(() => {}, 10000);
        }
    }
}

export async function fetchAllMilestones() {
    let retry = 5;

    let available = false;
    while (retry > 0) {
        try {
            available = await serverIsAvailable();
        } catch (err) {
            available = false;
        }
        retry--;
        if (available) {
            const jwt = getSoftwareSessionAsJson()["jwt"];
            const milestones = await softwareGet("100doc/milestones", jwt).then(resp => {
                if (isResponseOk(resp)) {
                    return resp.data;
                }
            });
            if (milestones) {
                retry = 0;
                compareWithLocalMilestones(milestones);
            }
        } else {
            // Wait 10 seconds before next try
            setTimeout(() => {}, 10000);
        }
    }
}

export function pushMilestonesToDb(date: number, milestones: Array<number>) {
    fetchAllMilestones();
    fetchMilestonesForYesterdayAndToday();
    fetchMilestonesByDate(Date.now());
    const dateData = new Date(date);
    const update: boolean = checkIfMilestonesAchievedOnDate(date);
    if (update) {
        // Takes into check new milestones and old ones
        milestones = getMilestonesByDate(date);
    }
    const offset_minutes = dateData.getTimezoneOffset();
    const day_number = getDayNumberFromDate(date);
    const sendMilestones = {
        day_number,
        local_date: Math.round(date / 1000), // milliseconds --> seconds
        offset_minutes,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        milestones
    };
    if (update) {
        toUpdateMilestones.push(sendMilestones);
        pushUpdatedMilestones();
    } else {
        toCreateMilestones.push(sendMilestones);
        pushNewMilestones();
    }
}

function getMilestonesByDate(date: number): Array<number> {
    const exists = checkMilestonesJson();
    if (!exists) {
        window.showErrorMessage("Cannot access Milestones file!");
        return [];
    }
    const dateOb = new Date(date);
    const dateNowOb = new Date();
    const dateNow = dateNowOb.valueOf();
    if (dateNow < date) {
        return [];
    }
    const sendMilestones: Array<number> = [];
    const filepath = getMilestonesJson();
    let rawMilestones = fs.readFileSync(filepath).toString();
    let milestones = JSON.parse(rawMilestones).milestones;
    for (let i = 0; i < milestones.length; i++) {
        if (milestones[i].achieved && compareDates(new Date(milestones[i].date_achieved), dateOb)) {
            sendMilestones.push(milestones[i].id);
        }
    }
    return sendMilestones;
}

export async function pushNewMilestones() {
    let retry = 5;
    let available = false;
    while (retry > 0) {
        try {
            available = await serverIsAvailable();
        } catch (err) {
            available = false;
        }
        retry--;
        if (available) {
            const jwt = getSoftwareSessionAsJson()["jwt"];
            const resp = await softwarePost("100doc/milestones", toCreateMilestones, jwt);
            const added: boolean = isResponseOk(resp);
            if (!added) {
                sentMilestonesDb = false;
            } else {
                sentMilestonesDb = true;
                toCreateMilestones = [];
                break;
            }
        } else {
            sentMilestonesDb = false;
        }
        // Wait 10 seconds before next try
        setTimeout(() => {}, 10000);
    }
}

export async function pushUpdatedMilestones() {
    // try to post new milestones before sending updated
    // milestones as the edits might be on the non posted milestones
    if (!sentMilestonesDb) {
        await pushNewMilestones();
    }
    let retry = 5;
    let available = false;
    while (retry > 0) {
        try {
            available = await serverIsAvailable();
        } catch (err) {
            available = false;
        }
        retry--;
        if (available) {
            const jwt = getSoftwareSessionAsJson()["jwt"];
            const resp = await softwarePut("100doc/milestones", toUpdateMilestones, jwt);
            const added: boolean = isResponseOk(resp);
            if (!added) {
                updatedMilestonesDb = false;
            } else {
                updatedMilestonesDb = true;
                toUpdateMilestones = [];
                break;
            }
        } else {
            sentMilestonesDb = false;
        }
        // Wait 10 seconds before next try
        setTimeout(() => {}, 10000);
    }
}

function compareWithLocalMilestones(dbMilestones: any) {
    const exists = checkMilestonesJson();
    if (!exists) {
        return;
    }
    const filepath = getMilestonesJson();
    let rawMilestones = fs.readFileSync(filepath).toString();
    let milestones = JSON.parse(rawMilestones).milestones;
    let dates = [];
    for (let i = 0; i < dbMilestones.length; i++) {
        const dbMilestonesLocalDate = dbMilestones[i].local_date * 1000;
        const dbDateOb = new Date(dbMilestonesLocalDate);
        const dbMilestonesArray: Array<number> = dbMilestones[i].milestones;
        let toAddDailyMilestones = [];
        for (let j = 0; j < dbMilestonesArray.length; j++) {
            const currMilestone = milestones[dbMilestonesArray[j] - 1];
            if (currMilestone.achieved && !compareDates(dbDateOb, new Date(currMilestone.date_achieved))) {
                // Daily Milestones
                if (
                    (currMilestone.id > 18 && currMilestone.id < 25) ||
                    (currMilestone.id > 48 && currMilestone.id < 57)
                ) {
                    toAddDailyMilestones.push(currMilestone.id);
                    if (dbMilestonesLocalDate > currMilestone.date_achieved) {
                        dates.push(dbMilestonesLocalDate, currMilestone.date_achieved);
                        milestones[currMilestone.id - 1].date_achieved = dbMilestonesLocalDate;
                    }
                } else if (dbMilestonesLocalDate < currMilestone.date_achieved) {
                    dates.push(dbMilestonesLocalDate, currMilestone.date_achieved);
                    milestones[currMilestone.id - 1].date_achieved = dbMilestonesLocalDate;
                }
            } else if (!currMilestone.achieved) {
                dates.push(dbMilestonesLocalDate);
                milestones[currMilestone.id - 1].achieved = true;
                milestones[currMilestone.id - 1].date_achieved = dbMilestonesLocalDate;
            }
        }
        if (toAddDailyMilestones.length > 0) {
            setDailyMilestonesByDayNumber(dbMilestones[i].day_number, toAddDailyMilestones);
        }
    }

    if (dates.length > 0) {
        // updateMilestonesByDate(dates);
        const sendMilestones = { milestones };
        try {
            fs.writeFileSync(filepath, JSON.stringify(sendMilestones, null, 4));
        } catch (err) {
            console.log(err);
        }
    }
}

function checkIfMilestonesAchievedOnDate(date: number): boolean {
    const exists = checkMilestonesJson();
    if (!exists) {
        return false;
    }
    const dateData = new Date(date);
    const filepath = getMilestonesJson();
    let rawMilestones = fs.readFileSync(filepath).toString();
    let milestones = JSON.parse(rawMilestones).milestones;
    let count = 0;
    for (let i = 0; i < milestones.length; i++) {
        if (milestones[i].achieved && compareDates(new Date(milestones[i].date_achieved), dateData)) {
            count++;
            // ensures that more than one milestone was achieved that day
            if (count > 1) {
                return true;
            }
        }
    }
    return false;
}

export function checkCodeTimeMetricsMilestonesAchieved(): void {
    let achievedMilestones = [];
    const user: User = getUserObject();

    // metrics of form [minutes, keystrokes, lines]
    const codeTimeMetrics = getSessionCodetimeMetrics();

    // prev code time users already have some metrics that
    // need to be taken into account for the day
    const onboarding = user.days <= 1;

    // check for aggregate codetime
    const aggHours = user.hours + codeTimeMetrics[0] / 60;
    if (aggHours >= 200) {
        achievedMilestones.push(6, 5, 4, 3, 2, 1);
    } else if (aggHours >= 120) {
        achievedMilestones.push(5, 4, 3, 2, 1);
    } else if (aggHours >= 90) {
        achievedMilestones.push(4, 3, 2, 1);
    } else if (aggHours >= 60) {
        achievedMilestones.push(3, 2, 1);
    } else if (aggHours >= 30) {
        achievedMilestones.push(2, 1);
    } else if (aggHours >= 1) {
        achievedMilestones.push(1);
    }

    // check for daily codetime. These will be given out daily
    const dayHours = codeTimeMetrics[0] / 60;
    if (dayHours >= 10) {
        achievedMilestones.push(24, 23, 22, 21, 20, 19);
    } else if (dayHours >= 8) {
        achievedMilestones.push(23, 22, 21, 20, 19);
    } else if (dayHours >= 5) {
        achievedMilestones.push(22, 21, 20, 19);
    } else if (dayHours >= 3) {
        achievedMilestones.push(21, 20, 19);
    } else if (dayHours >= 2) {
        achievedMilestones.push(20, 19);
    } else if (dayHours >= 1) {
        achievedMilestones.push(19);
    }

    // check for lines added
    const lines = user.lines_added + codeTimeMetrics[2];
    if (lines >= 10000) {
        achievedMilestones.push(30, 29, 28, 27, 26, 25);
    } else if (lines >= 1000) {
        achievedMilestones.push(29, 28, 27, 26, 25);
    } else if (lines >= 100) {
        achievedMilestones.push(28, 27, 26, 25);
    } else if (lines >= 50) {
        achievedMilestones.push(27, 26, 25);
    } else if (lines >= 16) {
        achievedMilestones.push(26, 25);
    } else if (lines >= 1) {
        achievedMilestones.push(25);
    }

    // check for keystrokes
    const keystrokes = user.keystrokes + codeTimeMetrics[1];
    if (keystrokes >= 42195) {
        achievedMilestones.push(42, 41, 40, 39, 38, 37);
    } else if (keystrokes >= 21097) {
        achievedMilestones.push(41, 40, 39, 38, 37);
    } else if (keystrokes >= 10000) {
        achievedMilestones.push(40, 39, 38, 37);
    } else if (keystrokes >= 5000) {
        achievedMilestones.push(39, 38, 37);
    } else if (keystrokes >= 1000) {
        achievedMilestones.push(38, 37);
    } else if (keystrokes >= 100) {
        achievedMilestones.push(37);
    }

    if (achievedMilestones.length > 0) {
        achievedMilestonesJson(achievedMilestones);
    }
}

export function checkLanguageMilestonesAchieved(): void {
    updateUserLanguages();
    const user: User = getUserObject();
    const languages = getLanguages();
    let milestones: Set<number> = new Set<number>();

    // single language check
    let language: string;
    for (language of languages) {
        switch (language) {
            case "c":
            case "cpp":
                milestones.add(51);
                break;
            case "html":
            case "css":
                milestones.add(54);
                break;
            case "javascript":
            case "javascriptreact":
                milestones.add(52);
                break;
            case "json":
            case "jsonc":
                milestones.add(55);
                break;
            case "java":
                milestones.add(49);
                break;
            case "plaintext":
                milestones.add(53);
                break;
            case "python":
                milestones.add(50);
                break;
            case "typescript":
            case "typescriptreact":
                milestones.add(56);
                break;
        }
    }

    // multi language check
    switch (user.languages.length) {
        default:
        case 6:
            milestones.add(48);
        case 5:
            milestones.add(47);
        case 4:
            milestones.add(46);
        case 3:
            milestones.add(45);
        case 2:
            milestones.add(44);
        case 1:
            milestones.add(43);
        case 0:
            break;
    }

    const milestonesAchieved = Array.from(milestones);
    if (milestonesAchieved.length > 0) {
        achievedMilestonesJson(milestonesAchieved);
    }
}

export function checkDaysMilestones(): void {
    const user: User = getUserObject();

    let days = user.days;
    let streaks = user.longest_streak;

    // curr day is completed only after a certain threshold hours are met
    // no checks for prev day
    if (user.currentHours < 0.5) {
        days--;
        streaks--;
    }
    let achievedMilestones = [];

    // checking for days
    if (days >= 110) {
        achievedMilestones.push(12);
    } else if (days >= 100) {
        achievedMilestones.push(11);
    } else if (days >= 75) {
        achievedMilestones.push(10);
    } else if (days >= 50) {
        achievedMilestones.push(9);
    } else if (days >= 10) {
        achievedMilestones.push(8);
    } else if (days >= 1) {
        achievedMilestones.push(7);
    }

    // checking for streaks
    if (streaks >= 100) {
        achievedMilestones.push(18);
    } else if (streaks >= 60) {
        achievedMilestones.push(17);
    } else if (streaks >= 30) {
        achievedMilestones.push(16);
    } else if (streaks >= 14) {
        achievedMilestones.push(15);
    } else if (streaks >= 7) {
        achievedMilestones.push(14);
    } else if (streaks >= 2) {
        achievedMilestones.push(13);
    }

    if (achievedMilestones.length > 0) {
        achievedMilestonesJson(achievedMilestones);
    }
}

export function checkSharesMilestones(): void {
    const user: User = getUserObject();
    const shares = user.shares;

    if (shares >= 100) {
        achievedMilestonesJson([36]);
    } else if (shares >= 50) {
        achievedMilestonesJson([35]);
    } else if (shares >= 21) {
        achievedMilestonesJson([34]);
    } else if (shares >= 10) {
        achievedMilestonesJson([33]);
    } else if (shares >= 5) {
        achievedMilestonesJson([32]);
    } else if (shares >= 1) {
        achievedMilestonesJson([31]);
    }
}

export function checkIfRepeating(id: number): boolean {
    if ((id > 18 && id < 25) || (id > 48 && id < 57)) {
        return true;
    }
    return false;
}

function checkIdRange(id: number): boolean {
    const MIN_ID = 1;
    const MAX_ID = 56;

    if (id >= MIN_ID && id <= MAX_ID) {
        return true;
    }
    return false;
}
// Used by logs
export function getMilestoneById(id: number) {
    const exists = checkMilestonesJson();
    if (!exists) {
        window.showErrorMessage("Cannot access Milestones file!");
    }
    if (!checkIdRange(id)) {
        window.showErrorMessage("Incorrect Milestone Id!");
        return {};
    }
    const filepath = getMilestonesJson();
    let rawMilestones = fs.readFileSync(filepath).toString();
    let milestones = JSON.parse(rawMilestones).milestones;
    return milestones[id - 1];
}

// Achieved Milestone change in json and logs
function achievedMilestonesJson(ids: Array<number>): void {
    const exists = checkMilestonesJson();
    if (!exists) {
        window.showErrorMessage("Cannot access Milestones file!");
    }

    let updatedIds = [];
    const filepath = getMilestonesJson();
    let rawMilestones = fs.readFileSync(filepath).toString();
    let milestones = JSON.parse(rawMilestones).milestones;
    const dateNow = new Date();
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];

        // Usually would never be triggered
        if (!checkIdRange(id)) {
            window.showErrorMessage("Incorrect Milestone Id!");
            continue;
        }

        // Updates daily - daily time and languages
        if ((id > 18 && id < 25) || (id > 48 && id < 57)) {
            const dateOb = new Date(milestones[id - 1].date_achieved);
            // Updates only if it wasn't achieved that day
            if (!compareDates(dateOb, dateNow)) {
                milestones[id - 1].achieved = true; // id is indexed starting 1
                milestones[id - 1].date_achieved = dateNow.valueOf();
                updatedIds.push(id);
            }
        }

        // If no date entry for the milestone has been made
        else if (!(milestones[id - 1].date_achieved && milestones[id - 1].date_achieved > 0)) {
            milestones[id - 1].achieved = true; // id is indexed starting 1
            milestones[id - 1].date_achieved = dateNow.valueOf();
            // For certificate
            if (id === 11) {
                window
                    .showInformationMessage(
                        "Whoa! You just unlocked the #100DaysOfCode Certificate. Please view it on the 100 Days of Code Dashboard.",
                        {
                            modal: true
                        },
                        "View Dashboard"
                    )
                    .then(selection => {
                        if (selection === "View Dashboard") {
                            commands.executeCommand("DoC.viewDashboard");
                        }
                    });
            }
            updatedIds.push(id);
        }
    }

    if (updatedIds.length > 0) {
        let sendMilestones = { milestones };

        // updates logs
        updateLogsMilestonesAndMetrics(updatedIds);

        // updates user
        let totalMilestonesAchieved = 0;
        for (let i = 0; i < milestones.length; i++) {
            if (milestones[i].achieved) {
                totalMilestonesAchieved++;
            }
        }
        updateUserMilestones(updatedIds, totalMilestonesAchieved);

        // update milestones file
        try {
            fs.writeFileSync(filepath, JSON.stringify(sendMilestones, null, 4));
        } catch (err) {
            console.log(err);
        }

        // updates db
        pushMilestonesToDb(dateNow.valueOf(), updatedIds);

        window
            .showInformationMessage("Hurray! You just achieved another milestone.", "View Milestones")
            .then(selection => {
                if (selection === "View Milestones") {
                    commands.executeCommand("DoC.viewMilestones");
                }
            });
    }
}

// checks if milestone was shared. if not makes it shared and updates user json
export function updateMilestoneShare(id: number) {
    const exists = checkMilestonesJson();
    if (!exists) {
        window.showErrorMessage("Cannot access Milestones file!");
    }
    if (!checkIdRange(id)) {
        window.showErrorMessage("Incorrect Milestone Id!");
        return;
    }
    const filepath = getMilestonesJson();
    let rawMilestones = fs.readFileSync(filepath).toString();
    let milestones = JSON.parse(rawMilestones).milestones;

    // check and update milestones if not shared
    if (!milestones[id - 1].shared) {
        milestones[id - 1].shared = true;
        let sendMilestones = { milestones };
        try {
            fs.writeFileSync(filepath, JSON.stringify(sendMilestones, null, 4));
        } catch (err) {
            console.log(err);
        }
        incrementUserShare();
        checkSharesMilestones();
    }
}

export function getMilestonesHtml(): string {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\milestones.html";
    } else {
        file += "/milestones.html";
    }
    return file;
}

export function milestoneShareUrlGenerator(id: number, title: string, description: string): string {
    const beginURI = "https://twitter.com/intent/tweet?url=https%3A%2F%2Fwww.software.com%2Fmilestone%2F";
    const endURI =
        "%0aWoohoo%21%20I%20earned%20this%20milestone%20while%20completing%20the%20%23100DaysOfCode%20Challenge%20with%20@software_hq%27s%20100%20Days%20of%20Code%20VS%20Code%20Plugin.&hashtags=100DaysOfCode%2CSoftware%2CDeveloper%2CAchiever";
    const titleURI = encodeURI(title);
    const descriptionURI = encodeURI(description);
    let url = `${beginURI}${id}&text=${titleURI}%20-%20${descriptionURI}${endURI}`;
    return url;
}

function getUpdatedMilestonesHtmlString(): string {
    fetchMilestonesByDate(Date.now());
    fetchAllMilestones();
    // Checks if the file exists and if not, creates a new file
    const exists = checkMilestonesJson();
    if (exists) {
        const filepath = getMilestonesJson();
        let rawMilestones = fs.readFileSync(filepath).toString();
        let milestones = JSON.parse(rawMilestones).milestones;
        let htmlString = [
            `<html>`,
            `\t<style>`,
            `\tbody {`,
            `\t\tfont-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,`,
            `\t\t\tUbuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;`,
            `\t}`,
            `\th1 {`,
            `\t\tfont-size: 24px;`,
            `\t\tfont-weight: 600;`,
            `\t}`,
            `\th2 {`,
            `\t\tfont-size: 21px;`,
            `\t\tfont-weight: 600;`,
            `\t}`,
            `\thr {`,
            `\t\theight: 3px;`,
            `\t\tborder: none;`,
            `\t\tcolor: rgba(255, 255, 255, 0.05);`,
            `\t\tbackground-color: rgba(255, 255, 255, 0.05);`,
            `\t}`,
            `\t`,
            `\t/* levels */`,
            `\t.keys {`,
            `\t\tdisplay: inline-block;`,
            `\t\tvertical-align: middle;`,
            `\t\tfont-size: 18px;`,
            `\t\tmargin-right: 5px;`,
            `\t}`,
            `\t.level1 {`,
            `\t\tbackground: linear-gradient(`,
            `\t\t\t180deg,`,
            `\t\t\trgba(251, 0, 0, 0.5) 0%,`,
            `\t\t\trgba(255, 151, 213, 0.5) 100%`,
            `\t\t);`,
            `\t}`,
            `\t.level2 {`,
            `\t\tbackground: linear-gradient(`,
            `\t\t\t180deg,`,
            `\t\t\trgba(255, 245, 0, 0.5) 0%,`,
            `\t\t\trgba(133, 250, 56, 0.5) 70.3%,`,
            `\t\t\trgba(0, 140, 39, 0.5) 100%`,
            `\t\t);`,
            `\t}`,
            `\t.level3 {`,
            `\t\tbackground: linear-gradient(`,
            `\t\t\t180deg,`,
            `\t\t\trgba(214, 126, 255, 0.5) 0%,`,
            `\t\t\trgba(86, 113, 255, 0.5) 67.71%,`,
            `\t\t\trgba(0, 224, 255, 0.5) 100%`,
            `\t\t);`,
            `\t}`,
            `\t.level4 {`,
            `\t\tbackground: linear-gradient(`,
            `\t\t\t180deg,`,
            `\t\t\trgba(255, 0, 0, 0.5) 2.05%,`,
            `\t\t\trgba(255, 168, 0, 0.5) 73.44%,`,
            `\t\t\trgba(255, 245, 0, 0.5) 100%`,
            `\t\t);`,
            `\t}`,
            `\t.level5 {`,
            `\t\tbackground: linear-gradient(`,
            `\t\t\t180deg,`,
            `\t\t\trgba(0, 224, 255, 0.5) 0%,`,
            `\t\t\trgba(219, 0, 255, 0.5) 49.6%,`,
            `\t\t\trgba(253, 106, 0, 0.5) 100%`,
            `\t\t);`,
            `\t}`,
            `\t.level6 {`,
            `\t\tbackground: linear-gradient(`,
            `\t\t\t180deg,`,
            `\t\t\trgba(219, 0, 255, 0.5) 3.41%,`,
            `\t\t\trgba(103, 115, 255, 0.5) 18.6%,`,
            `\t\t\trgba(13, 208, 255, 0.5) 32.96%,`,
            `\t\t\trgba(88, 213, 51, 0.5) 51.83%,`,
            `\t\t\trgba(255, 237, 1, 0.5) 75.22%,`,
            `\t\t\trgba(255, 97, 1, 0.5) 86.71%,`,
            `\t\t\trgba(255, 10, 1, 0.5) 100%`,
            `\t\t);`,
            `\t}`,
            `\t.inf {`,
            `\t\tfont-size: larger;`,
            `\t}`,
            `\t.circle {`,
            `\t\tdisplay: inline-block;`,
            `\t\tvertical-align: middle;`,
            `\t\theight: 30px;`,
            `\t\twidth: 30px;`,
            `\t\tborder-radius: 50%;`,
            `\t\tfont-size: 18px;`,
            `\t\ttext-align: center;`,
            `\t\tline-height: 30px;`,
            `\t\tmargin-right: 2px;`,
            `\t}`,
            `\t`,
            `\t/* Milestone card */`,
            `\t.milestoneCard {`,
            `\t\tbackground-color: rgba(255, 255, 255, 0.05);`,
            `\t\tdisplay: inline-block;`,
            `\t\tmargin: 10px;`,
            `\t\tposition: relative;`,
            `\t\theight: 235px;`,
            `\t\twidth: 200px;`,
            `\t\tborder-radius: 3px;`,
            `\t}`,
            `\t.milestoneShare {`,
            `\t\tposition: absolute;`,
            `\t\tright: 10px;`,
            `\t\ttop: 10px;`,
            `\t\theight: auto;`,
            `\t\twidth: 10px;`,
            `\t}`,
            `\t.milestoneCardLevel {`,
            `\t\tposition: absolute;`,
            `\t\twidth: 50px;`,
            `\t\theight: 18px;`,
            `\t\tleft: 7px;`,
            `\t\ttop: 7px;`,
            `\t\tline-height: 18px;`,
            `\t\tfont-size: 12px;`,
            `\t\tfont-weight: 250;`,
            `\t\tborder-radius: 3px;`,
            `\t\ttext-align: center;`,
            `\t\tvertical-align: middle;`,
            `\t}`,
            `\t.milestoneTitle {`,
            `\t\tposition: absolute;`,
            `\t\ttop: 27px;`,
            `\t\ttext-align: center;`,
            `\t\twidth: inherit;`,
            `\t\tfont-size: 18px;`,
            `\t\tfont-weight: 350;`,
            `\t}`,
            `\t.logo {`,
            `\t\theight: 100px;`,
            `\t\twidth: 100px;`,
            `\t\tposition: absolute;`,
            `\t\ttop: 60px;`,
            `\t\tleft: 50px;`,
            `\t}`,
            `\t.milestoneDesc {`,
            `\t\tposition: absolute;`,
            `\t\twidth: inherit;`,
            `\t\ttext-align: center;`,
            `\t\tfont-size: 14px;`,
            `\t\tbottom: 40px;`,
            `\t}`,
            `\t.date {`,
            `\t\tposition: absolute;`,
            `\t\twidth: inherit;`,
            `\t\ttext-align: center;`,
            `\t\tfont-size: 14px;`,
            `\t\tfont-weight: 350;`,
            `\t\tbottom: 10px;`,
            `\t\tcolor: #919eab;`,
            `\t}`,
            `\t`,
            `\t/* Grayed */`,
            `\t.grayed {`,
            `\t\tcolor: #6d6d6d;`,
            `\t\tfilter: grayscale(100%);`,
            `\t}`,
            `\t.grayedLevel {`,
            `\t\tbackground: #474747;`,
            `\t}`,
            `\t.noMilestones {`,
            `\t\tfont-size: 18px;`,
            `\t\tfont-weight: 600;`,
            `\t\ttext-align: center;`,
            `\t}`,
            `\t.hiddenId {`,
            `\t\tvisibility: hidden;`,
            `\t},`,
            `\t</style>`,
            `\t<body>`,
            `\t\t<h1>Milestones</h1>`,
            `\t\t<div class="keys">Levels:</div>`,
            `\t\t<div class="circle level1">1</div>`,
            `\t\t<div class="circle level2">2</div>`,
            `\t\t<div class="circle level3">3</div>`,
            `\t\t<div class="circle level4">4</div>`,
            `\t\t<div class="circle level5">5</div>`,
            `\t\t<div class="circle level6"><span class="inf">∞</span></div>\n`
        ].join("\n");

        // for calculating recents
        const date = Date.now();

        // for adding to the html string later
        let recents: string = "";
        let allMilestones: string = "\n\t\t<hr>\n\t\t<h2>All Milestones</h2>\n";

        // share icon
        for (let i = 0; i < milestones.length; i++) {
            const milestone = milestones[i];
            const id: number = milestone.id;
            const title: string = milestone.title;
            const description: string = milestone.description;
            const level: number = milestone.level;
            const achieved: boolean = milestone.achieved;
            const shareIcon: string = milestone.shared ? "https://100-days-of-code.s3-us-west-1.amazonaws.com/Milestones/alreadyShared.svg" : "https://100-days-of-code.s3-us-west-1.amazonaws.com/Milestones/share.svg";

            let icon: string;
            let dateAchieved: number = 0;
            const shareLink = milestoneShareUrlGenerator(i + 1, title, description);
            // If achieved, card must be colored. Otherwise, card should be gray

            // for adding gray scale effect class into html
            let grayedCard: string = "";
            let grayedLevel: string = "";

            // can only share if achieved
            let shareHtml: string = "";

            // can only have date if achieved
            let dateHtml: string = "";

            // Re: If achieved, card must be colored. Otherwise, card should be gray
            if (achieved) {
                icon = milestone.icon;
                dateAchieved = milestone.date_achieved;
                shareHtml = `\t\t\t<a href="${shareLink}" title="Share this on Twitter"><img src="${shareIcon}" class="milestoneShare"/></a>`;

                // getting date in mm/dd/yyyy format
                let dateOb = new Date(dateAchieved);

                const dayNum = dateOb.getDate();
                const month = dateOb.getMonth() + 1; // Month is 0 indexed
                const year = dateOb.getFullYear();

                dateHtml = `\t\t\t<div class="date">${month}/${dayNum}/${year}</div>`;
            } else {
                icon = milestone.gray_icon;
                grayedCard = "grayed";
                grayedLevel = "grayedLevel";
            }

            // if level 0, no level tag on top.
            // if level 6, replace it with ∞
            let levelHtml: string = "";
            if (level > 0 && level < 6) {
                levelHtml = `\t\t\t<div class="level${level} milestoneCardLevel ${grayedLevel}">Level ${level}</div>`;
            } else if (level === 6) {
                levelHtml = `\t\t\t<div class="level${level} milestoneCardLevel ${grayedLevel}">Level <span class="inf">∞</span></div>`;
            }

            const milestoneCardHtml: string = [
                `\t\t<div class="milestoneCard ${grayedCard}">`,
                `\t\t\t<div class="hiddenId">${id}</div>`,
                `${levelHtml}`,
                `${shareHtml}`,
                `\t\t\t<div class="milestoneTitle">${title}</div>`,
                `\t\t\t<img class="logo" src=${icon} alt="Connect internet to view this really cool logo!">`,
                `\t\t\t<div class="milestoneDesc">${description}</div>`,
                `${dateHtml}`,
                `\t\t</div>\n`
            ].join("\n");

            // Checks for the same date
            const dateNow = new Date();
            const dateOb = new Date(dateAchieved);
            if (compareDates(dateOb, dateNow)) {
                if (recents === "") {
                    recents += `\n\t\t<h2>Today's Milestones</h2>\n`;
                }
                recents += milestoneCardHtml;
            }

            allMilestones += milestoneCardHtml;
        }

        // If no milestones earned within a week
        if (recents === "") {
            recents += `\n\t\t<h2>Today's Milestones</h2>\n`;
            recents += `\t\t<div class="noMilestones">No Milestones in the Past 24 hours</div>\n`;
        }

        // adding recent and all milestones to html
        htmlString += recents;
        htmlString += allMilestones;

        // end
        htmlString += [
            `\t</body>`,
            `\t<script>`,
            `\t\tconst vscode = acquireVsCodeApi();`,
            `\t\tvar shareButtons = document.getElementsByClassName("milestoneShare");\n`,
            `\t\tfor (let i = 0; i < shareButtons.length; i++) {`,
            `\t\t\tshareButtons[i].addEventListener("click", function () {`,
            `\t\t\t\tvar hiddenId = this.parentNode.parentNode.getElementsByClassName(`,
            `\t\t\t\t\t"hiddenId"`,
            `\t\t\t\t)[0].textContent;`,
            `\t\t\t\tthis.src = "https://100-days-of-code.s3-us-west-1.amazonaws.com/Milestones/alreadyShared.svg";`,
            `\t\t\t\tvscode.postMessage({command: "incrementShare", value: hiddenId});`,
            `\t\t\t});`,
            `\t\t}`,
            `\t</script>`,
            `</html>`
        ].join("\n");
        return htmlString;
    } else {
        return "Couldn't get Milestones HTML";
    }
}

export function updateMilestonesHtml(): void {
    let filepath = getMilestonesHtml();
    try {
        fs.writeFileSync(filepath, getUpdatedMilestonesHtmlString());
    } catch (err) {
        console.log(err);
    }
}
