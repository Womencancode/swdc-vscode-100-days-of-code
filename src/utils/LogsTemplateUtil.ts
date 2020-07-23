import { window } from "vscode";
import { getSummaryObject } from "./SummaryUtil";
import { getMilestoneById } from "./MilestonesUtil";
import { Log } from "../models/Log";
import { getAllLogObjects } from "./LogsUtil";
import { compareDates } from "./Util";
import path = require("path");
import fs = require("fs");
import { monthNames } from "./Constants";

function getLogsTemplate() {
    return path.join(__dirname, "../assets/templates/logs.template.html");
}

function getStyleColorsBasedOnMode(): any {
    const tempWindow: any = window;

    let cardTextColor = "#FFFFFF";
    let cardBackgroundColor = "rgba(255,255,255,0.05)";
    let cardMetricBarSidesColor = "rgba(255,255,255,0.20)";
    let editButtonColor = "rgba(255,255,255,0.10)";
    let cardToolTipColor = "rgba(109, 109, 109, .9)";
    let dropDownPath = "https://100-days-of-code.s3-us-west-1.amazonaws.com/Logs/dropDown.svg";
    let editLogCardColor = "#292929";
    let lightGrayColor = "#919eab";
    if (tempWindow.activeColorTheme.kind === 1) {
        cardTextColor = "#444444";
        cardBackgroundColor = "rgba(0,0,0,0.10)";
        cardMetricBarSidesColor = "rgba(0,0,0,0.20)";
        editButtonColor = "rgba(0,0,0,0.10)";
        cardToolTipColor = "rgba(165, 165, 165, .9)";
        editLogCardColor = "#E5E5E5";
        lightGrayColor = "#596673";
    }
    return {
        cardTextColor,
        cardBackgroundColor,
        cardMetricBarSidesColor,
        cardToolTipColor,
        dropDownPath,
        editLogCardColor,
        editButtonColor,
        lightGrayColor
    };
}

function generateShareUrl(
    day_number: number,
    title: string,
    hours: number,
    keystrokes: number,
    lines_added: number
): string {
    // Share link
    let dayURI = encodeURI(`Day ${day_number}/100 of`);
    let shareText = [
        `\n\n${title}`,
        `\nHours coded: ${hours}`,
        `Lines of code: ${lines_added}`,
        `Keystrokes: ${keystrokes}\n\n`
    ].join("\n");
    const shareURI = encodeURI(shareText);
    const hashtagURI = "%23";
    return `https://twitter.com/intent/tweet?url=https%3A%2F%2Fwww.software.com%2F100-days-of-code&text=${dayURI}%20${hashtagURI}100DaysOfCode${shareURI}via%20@software_hq's%20${hashtagURI}vscode%20extension`;
}

function getFormattedDate(timestamp: number): string {
    const date = new Date(timestamp);
    const dayOfMonth = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return month + " " + dayOfMonth + ", " + year;
}

function getLogsCardSummaryVariables(dayHours: number, dayKeystrokes: number, dayLinesAdded: number) {
    const summary = getSummaryObject();
    const hours = summary.hours + summary.currentHours;
    const keystrokes = summary.keystrokes + summary.currentKeystrokes;
    const lines = summary.lines_added + summary.currentLines;
    const days = summary.days;
    let avgHours = parseFloat((hours / days).toFixed(2));
    let avgKeystrokes = parseFloat((keystrokes / days).toFixed(2));
    let avgLines = parseFloat((lines / days).toFixed(2));

    let percentHours = (dayHours / avgHours) * 100;
    percentHours = Math.round(percentHours * 100) / 100;
    if (!avgHours || avgHours === 0) {
        percentHours = 100;
        avgHours = 0;
    }
    let percentKeystrokes = (dayKeystrokes / avgKeystrokes) * 100;
    percentKeystrokes = Math.round(percentKeystrokes * 100) / 100;
    if (!avgKeystrokes || avgKeystrokes === 0) {
        percentKeystrokes = 100;
        avgKeystrokes = 0;
    }
    let percentLines = (dayLinesAdded / avgLines) * 100;
    percentLines = Math.round(percentLines * 100) / 100;
    if (!avgLines || avgLines === 0) {
        percentLines = 100;
        avgLines = 0;
    }

    let barPxHours = Math.round(percentHours * 1.3);
    let barColorHours = "00b4ee";
    if (barPxHours >= 130) {
        barPxHours = 130;
        barColorHours = "FD9808";
    } else if (barPxHours < 20 && barPxHours > 0) {
        barPxHours = 20;
    }
    let barPxKeystrokes = Math.round(percentKeystrokes * 1.3);
    let barColorKeystrokes = "00b4ee";
    if (barPxKeystrokes >= 130) {
        barPxKeystrokes = 130;
        barColorKeystrokes = "FD9808";
    } else if (barPxKeystrokes < 20 && barPxKeystrokes > 0) {
        barPxKeystrokes = 20;
    }
    let barPxLines = Math.round(percentLines * 1.3);
    let barColorLines = "00b4ee";
    if (barPxLines >= 130) {
        barPxLines = 130;
        barColorLines = "FD9808";
    } else if (barPxLines < 20 && barPxLines > 0) {
        barPxLines = 20;
    }

    return {
        avgHours,
        percentHours,
        barPxHours,
        barColorHours,
        avgKeystrokes,
        percentKeystrokes,
        barPxKeystrokes,
        barColorKeystrokes,
        avgLines,
        percentLines,
        barPxLines,
        barColorLines
    };
}

function getLinksText(links: Array<string>): string {
    let linksText = "";
    for (let i = 0; i < links.length; i++) {
        linksText += [
            `\t\t\t\t\t\t<a class="cardLinkText" href="${links[i]}">`,
            `\t\t\t\t\t\t\t${links[i]}`,
            `\t\t\t\t\t\t</a>\n`
        ].join("\n");
    }
    return linksText;
}

function getMilestonesText(milestones: Array<number>): string {
    let milestonesText = "";
    const milestoneNum = milestones.length;
    for (let milestoneIndex = 0; milestoneIndex < 9; milestoneIndex++) {
        if (milestoneIndex % 3 === 0) {
            milestonesText += `\t\t\t\t\t<div class="cardMilestoneRow">\n`;
        }

        if (milestoneIndex < milestoneNum) {
            let milestoneId = milestones[milestoneIndex];
            let milestone = getMilestoneById(milestoneId);
            milestonesText += [
                `\t\t\t\t\t\t<div class="cardMilestone">`,
                `\t\t\t\t\t\t\t<span class="tooltiptext">`,
                `\t\t\t\t\t\t\t\t<div style="font-weight: bold;">${milestone.title}</div>`,
                `\t\t\t\t\t\t\t\t<div>${milestone.description}</div>`,
                `\t\t\t\t\t\t\t</span>`,
                `\t\t\t\t\t\t\t<img class="cardMilestoneIcon" src="${milestone.icon}" alt="${milestone.title}">`,
                `\t\t\t\t\t\t</div>\n`
            ].join("\n");
        } else {
            milestonesText += [`\t\t\t\t\t\t<div class="cardMilestone">`, `\t\t\t\t\t\t</div>\n`].join("\n");
        }

        if (milestoneIndex % 3 === 2) {
            milestonesText += `\t\t\t\t\t</div>\n`;
        }
    }
    return milestonesText;
}

function getLogCard(
    day: Log,
    formattedDate: string,
    twitterShareUrl: string,
    shareIconLink: string,
    dropDownPath: string
): string {
    const {
        avgHours,
        percentHours,
        barPxHours,
        barColorHours,
        avgKeystrokes,
        percentKeystrokes,
        barPxKeystrokes,
        barColorKeystrokes,
        avgLines,
        percentLines,
        barPxLines,
        barColorLines
    } = getLogsCardSummaryVariables(
        day.codetime_metrics.hours,
        day.codetime_metrics.keystrokes,
        day.codetime_metrics.lines_added
    );
    const { lightGrayColor } = getStyleColorsBasedOnMode();
    const linksText = getLinksText(day.links);
    const milestonesText = getMilestonesText(day.milestones);
    return [
        `\t<div class="logCard">`,
        `\t\t<div class="cardHeader">`,
        `\t\t\t<div class="cardHeaderTextSection">`,
        `\t\t\t\t<div class="cardSubject">Day ${day.day_number}: ${day.title}</div>`,
        `\t\t\t\t<div class="cardTextGroup">`,
        `\t\t\t\t\t<div class="cardDateText">${formattedDate}</div>`,
        `\t\t\t\t</div>`,
        `\t\t\t</div>`,
        `\t\t\t<div class="cardHeaderButtonSection">`,
        `\t\t\t\t<a href="${twitterShareUrl}" title="Share this on Twitter"><button class="cardHeaderShareButton"><img class="cardHeaderShareButtonIcon" src=${shareIconLink} alt="Share"></button></a>`,
        `\t\t\t\t<button class="cardHeaderEditLogButton">Edit Log</button>`,
        `\t\t\t\t<button class="cardHeaderDropDownButton"><img class="cardHeaderDropDownButtonIcon" src=${dropDownPath} alt="Drop Down"></button>`,
        `\t\t\t</div>`,
        `\t\t</div>`,
        `\t\t<div class="cardContent">`,
        `\t\t\t<div class="cardTextSection">`,
        `\t\t\t\t<div class="cardTextGroup">`,
        `\t\t\t\t\t<div class="cardText">${day.description}</div>`,
        `\t\t\t\t\t<br>`,
        `\t\t\t\t</div>`,
        `\t\t\t\t<div class="cardTextGroup">`,
        `\t\t\t\t\t<div>\n`,
        `${linksText}`,
        `\t\t\t\t\t</div>`,
        `\t\t\t\t</div>`,
        `\t\t\t</div>`,
        `\t\t\t<div class="cardMetricsSection">`,
        `\t\t\t\t<div class="cardMetricsTitle">Coding Metrics</div>`,
        `\t\t\t\t<br>`,
        `\t\t\t\t<div class='cardMetricGrid'>`,
        `\t\t\t\t\t<div class="cardMetric">`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 14px; margin-bottom: 5px;">Code Time</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 20px; margin-bottom: 20px;">${day.codetime_metrics.hours}</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 12px; font-weight: normal; color: ${lightGrayColor}; margin-bottom: 5px;">${percentHours}% of average</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 12px; font-weight: normal; color: ${lightGrayColor}; margin-bottom: 20px;">Average: ${avgHours} Hours</div>`,
        `\t\t\t\t\t\t<div class="cardMetricBarGroup">`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarMiddle"></div>`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarMiddle" style="width: ${barPxHours}px; background-color: #${barColorHours};"></div>`,
        `\t\t\t\t\t\t</div>`,
        `\t\t\t\t\t</div>`,
        `\t\t\t\t\t<div class="cardMetric">`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 14px; margin-bottom: 5px;">Keystrokes</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 20px; margin-bottom: 20px;">${day.codetime_metrics.keystrokes}</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 12px; font-weight: normal; color: ${lightGrayColor}; margin-bottom: 5px;">${percentKeystrokes}% of average</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 12px; font-weight: normal; color: ${lightGrayColor}; margin-bottom: 20px;">Average: ${avgKeystrokes}</div>`,
        `\t\t\t\t\t\t<div class="cardMetricBarGroup">`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarRight"></div>`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarMiddle"></div>`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarMiddle" style="width: ${barPxKeystrokes}px; background-color: #${barColorKeystrokes};"></div>`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarLeft"></div>`,
        `\t\t\t\t\t\t</div>`,
        `\t\t\t\t\t</div>`,
        `\t\t\t\t\t<div class="cardMetric">`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 14px; margin-bottom: 5px;">Lines Added</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 20px; margin-bottom: 20px;">${day.codetime_metrics.lines_added}</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 12px; font-weight: normal; color: ${lightGrayColor}; margin-bottom: 5px;">${percentLines}% of average</div>`,
        `\t\t\t\t\t\t<div class="cardMetricText" style="font-size: 12px; font-weight: normal; color: ${lightGrayColor}; margin-bottom: 20px;">Average: ${avgLines}</div>`,
        `\t\t\t\t\t\t<div class="cardMetricBarGroup">`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarRight"></div>`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarMiddle"></div>`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarMiddle" style="width: ${barPxLines}px; background-color: #${barColorLines};"></div>`,
        `\t\t\t\t\t\t\t<div class="cardMetricBarLeft"></div>`,
        `\t\t\t\t\t\t</div>`,
        `\t\t\t\t\t</div>`,
        `\t\t\t\t</div>`,
        `\t\t\t</div>`,
        `\t\t\t<div class="cardMilestoneSection">`,
        `\t\t\t\t<div class="cardMilestoneTitle">Milestones</div>`,
        `\t\t\t\t<br>`,
        `\t\t\t\t<div class="cardMilestoneGrid">\n`,
        `${milestonesText}`,
        `\t\t\t\t\t</div>`,
        `\t\t\t\t</div>`,
        `\t\t\t</div>`,
        `\t\t</div>`,
        `\t</div>\n`
    ].join("\n");
}

export function getUpdatedLogsHtml(): string {
    let logs: Array<Log> = getAllLogObjects();

    // if in light mode
    const {
        cardTextColor,
        cardBackgroundColor,
        cardMetricBarSidesColor,
        cardToolTipColor,
        dropDownPath,
        editLogCardColor,
        editButtonColor
    } = getStyleColorsBasedOnMode();

    // CSS
    let logsHtml = "";
    let addLogVisibility = "hidden";

    let submittedLogToday: boolean;
    if (
        logs.length < 1 ||
        (logs.length === 1 && logs[0].title === "No Title" && compareDates(new Date(), new Date(logs[0].date)))
    ) {
        logsHtml = `\t\t<h2 id='noLogs'>Log Daily Progress to see it here!</h2>`;
        addLogVisibility = "visible";
    } else {
        let mostRecentLog = logs[logs.length - 1];
        let logDate = new Date(mostRecentLog.date);
        let dateNow = new Date();
        submittedLogToday = compareDates(dateNow, logDate) && mostRecentLog.title !== "No Title";

        if (!submittedLogToday) {
            addLogVisibility = "visible";
        }

        for (let i = logs.length - 1; i >= 0; i--) {
            if (!submittedLogToday && i === logs.length - 1) {
                continue;
            }

            const day = logs[i];

            const twitterShareUrl = generateShareUrl(
                day.day_number,
                day.title,
                day.codetime_metrics.hours,
                day.codetime_metrics.keystrokes,
                day.codetime_metrics.lines_added
            );

            const formattedDate = getFormattedDate(day.date);

            const shareIconLink = "https://100-days-of-code.s3-us-west-1.amazonaws.com/Milestones/share.svg";

            logsHtml += getLogCard(day, formattedDate, twitterShareUrl, shareIconLink, dropDownPath);
        }
    }

    const templateVars = {
        logsHtml,
        cardTextColor,
        cardBackgroundColor,
        cardMetricBarSidesColor,
        cardToolTipColor,
        dropDownPath,
        editLogCardColor,
        editButtonColor,
        addLogVisibility
    };

    const templateString = fs.readFileSync(getLogsTemplate()).toString();
    const fillTemplate = function (templateString: string, templateVars: any) {
        return new Function("return `" + templateString + "`;").call(templateVars);
    };

    const logsHtmlContent = fillTemplate(templateString, templateVars);
    return logsHtmlContent;
}
