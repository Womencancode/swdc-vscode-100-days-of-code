import { Disposable, commands, window, TreeView, ViewColumn, WebviewPanel, Uri } from "vscode";
import { TreeNode } from "../models/TreeNode";
import { Tree100DoCProvider, connectDoCTreeView } from "../tree/Tree100DoCProvider";
import { getLogsHtml, updateLogsHtml, addLogToJson, editLogEntry, updateLogShare } from "./LogsUtil";
import {
    updateMilestonesHtml,
    getMilestonesHtml,
    checkDaysMilestones,
    checkLanguageMilestonesAchieved,
    checkCodeTimeMetricsMilestonesAchieved,
    updateMilestoneShare
} from "./MilestonesUtil";
import { updateAddLogHtml, getAddLogHtml } from "./addLogUtil";
import { getUpdatedDashboardHtmlString, getCertificateHtmlString } from "./DashboardUtil";
import { displayReadmeIfNotExists } from "./Util";
const fs = require("fs");

export function createCommands(): { dispose: () => void } {
    let cmds: any[] = [];
    let currentPanel: WebviewPanel | undefined = undefined;

    const Doc100SftwProvider = new Tree100DoCProvider();
    const Doc100SftwTreeView: TreeView<TreeNode> = window.createTreeView("100DoC-tree", {
        treeDataProvider: Doc100SftwProvider,
        showCollapseAll: true
    });
    Doc100SftwProvider.bindView(Doc100SftwTreeView);
    cmds.push(connectDoCTreeView(Doc100SftwTreeView));

    cmds.push(commands.registerCommand("DoC.ViewReadme", () => {
        displayReadmeIfNotExists(true);
    }));

    cmds.push(
        commands.registerCommand("DoC.viewLogs", () => {
            updateLogsHtml();
            const logsHtmlPath = getLogsHtml();

            if (currentPanel) {
                if (currentPanel.title !== "Logs") {
                    currentPanel.dispose();
                    commands.executeCommand("DoC.viewLogs");
                } else {
                    fs.readFile(logsHtmlPath, "utf8", (err: Error, data: string) => {
                        if (err) {
                            console.log(err);
                        }
                        // have to implement this check for worst case scenario
                        if (currentPanel) {
                            currentPanel.webview.html = data;
                        }
                    });
                    currentPanel.reveal(ViewColumn.One);
                }
            } else {
                currentPanel = window.createWebviewPanel("Logs", "Logs", ViewColumn.One, {
                    enableScripts: true
                });

                fs.readFile(logsHtmlPath, "utf8", (err: Error, data: string) => {
                    if (err) {
                        console.log(err);
                    }
                    if (currentPanel) {
                        currentPanel.webview.html = data;
                    }
                });

                const logInterval = setInterval(() => {
                    // updates only in the background
                    if (currentPanel && !currentPanel.active) {
                        updateLogsHtml();
                        fs.readFile(logsHtmlPath, "utf8", (err: Error, data: string) => {
                            if (err) {
                                console.log(err);
                            }
                            // have to implement this check for worst case scenario
                            if (currentPanel) {
                                currentPanel.webview.html = data;
                            }
                        });
                    }
                }, 60000);

                currentPanel.webview.onDidReceiveMessage(message => {
                    switch (message.command) {
                        case "editLog":
                            const dayUpdate = message.value;

                            editLogEntry(
                                parseInt(dayUpdate.day_number),
                                dayUpdate.title,
                                dayUpdate.description,
                                dayUpdate.links,
                                dayUpdate.hours
                            );
                            break;
                        case "addLog":
                            if (currentPanel) {
                                currentPanel.dispose();
                            }
                            commands.executeCommand("DoC.addLog");
                            break;
                        case "incrementShare":
                            updateLogShare(message.value);
                            break;
                    }
                });

                currentPanel.onDidDispose(() => {
                    clearInterval(logInterval);
                    currentPanel = undefined;
                });
            }
        })
    );

    cmds.push(
        commands.registerCommand("DoC.viewDashboard", () => {
            if (currentPanel) {
                if (currentPanel.title !== "Dashboard") {
                    currentPanel.dispose();
                    commands.executeCommand("DoC.viewDashboard");
                } else {
                    if (currentPanel) {
                        currentPanel.webview.html = getUpdatedDashboardHtmlString();
                    }
                    currentPanel.reveal(ViewColumn.One);
                }
            } else {
                currentPanel = window.createWebviewPanel("Dashboard", "Dashboard", ViewColumn.One, {
                    enableScripts: true
                });

                if (currentPanel) {
                    currentPanel.webview.html = getUpdatedDashboardHtmlString();
                }

                const dashboardInterval = setInterval(() => {
                    if (currentPanel) {
                        currentPanel.webview.html = getUpdatedDashboardHtmlString();
                    }
                }, 60000);

                currentPanel.webview.onDidReceiveMessage(message => {
                    switch (message.command) {
                        case "Logs":
                            if (currentPanel) {
                                currentPanel.dispose();
                                commands.executeCommand("DoC.viewLogs");
                            }
                            break;
                        case "Milestones":
                            if (currentPanel) {
                                currentPanel.dispose();
                                commands.executeCommand("DoC.viewMilestones");
                            }
                            break;
                        case "Certificate":
                            window
                                .showInputBox({
                                    placeHolder: "Your name",
                                    prompt:
                                        "Please enter your name for getting the certificate. Please make sure that you are connected to the internet."
                                })
                                .then(text => {
                                    if (text) {
                                        const panel = window.createWebviewPanel(
                                            "Congratulations!",
                                            "Congratulations!",
                                            ViewColumn.One
                                        );
                                        panel.webview.html = getCertificateHtmlString(text);
                                        panel.reveal(ViewColumn.One);
                                    }
                                });
                    }
                });

                currentPanel.onDidDispose(() => {
                    clearInterval(dashboardInterval);
                    currentPanel = undefined;
                });
            }
        })
    );

    cmds.push(
        commands.registerCommand("DoC.viewMilestones", () => {
            checkCodeTimeMetricsMilestonesAchieved();
            checkLanguageMilestonesAchieved();
            checkDaysMilestones();
            updateMilestonesHtml();
            const milestonesHtmlPath = getMilestonesHtml();

            if (currentPanel) {
                if (currentPanel.title !== "Milestones") {
                    currentPanel.dispose();
                    commands.executeCommand("DoC.viewMilestones");
                } else {
                    fs.readFile(milestonesHtmlPath, "utf8", (err: Error, data: string) => {
                        if (err) {
                            console.log(err);
                        }
                        // have to implement this check for worst case scenario
                        if (currentPanel) {
                            currentPanel.webview.html = data;
                        }
                    });
                    currentPanel.reveal(ViewColumn.One);
                }
            } else {
                currentPanel = window.createWebviewPanel("Milestones", "Milestones", ViewColumn.One, {
                    enableScripts: true
                });
                fs.readFile(milestonesHtmlPath, "utf8", (err: Error, data: string) => {
                    if (err) {
                        console.log(err);
                    }
                    // have to implement this check for worst case scenario
                    if (currentPanel) {
                        currentPanel.webview.html = data;
                    }
                });

                const milestoneInterval = setInterval(() => {
                    updateMilestonesHtml();
                    fs.readFile(milestonesHtmlPath, "utf8", (err: Error, data: string) => {
                        if (err) {
                            console.log(err);
                        }
                        // have to implement this check for worst case scenario
                        if (currentPanel) {
                            currentPanel.webview.html = data;
                        }
                    });
                }, 60000);

                currentPanel.webview.onDidReceiveMessage(message => {
                    switch (message.command) {
                        case "incrementShare":
                            updateMilestoneShare(message.value);
                            break;
                    }
                });

                currentPanel.onDidDispose(() => {
                    clearInterval(milestoneInterval);
                    currentPanel = undefined;
                });
            }
        })
    );

    cmds.push(
        commands.registerCommand("DoC.addLog", () => {
            updateAddLogHtml();
            const addLogHtmlPath = getAddLogHtml();

            if (currentPanel) {
                if (currentPanel.title !== "Add Daily Progress Log") {
                    currentPanel.dispose();
                    commands.executeCommand("DoC.addLog");
                } else {
                    fs.readFile(addLogHtmlPath, "utf8", (err: Error, data: string) => {
                        if (err) {
                            console.log(err);
                        }
                        // have to implement this check for worst case scenario
                        if (currentPanel) {
                            currentPanel.webview.html = data;
                        }
                    });
                    currentPanel.reveal(ViewColumn.One);
                }
            } else {
                currentPanel = window.createWebviewPanel(
                    "Add Daily Progress Log",
                    "Add Daily Progress Log",
                    ViewColumn.One,
                    { enableScripts: true }
                );

                fs.readFile(addLogHtmlPath, "utf8", (err: Error, data: string) => {
                    if (err) {
                        console.log(err);
                    }
                    if (currentPanel) {
                        currentPanel.webview.html = data;
                    }
                });

                // handle submit or cancel
                let log;
                currentPanel.webview.onDidReceiveMessage(message => {
                    switch (message.command) {
                        case "cancel":
                            if (currentPanel) {
                                currentPanel.dispose();
                            }
                            commands.executeCommand("DoC.viewLogs");
                            break;

                        case "log":
                            if (currentPanel) {
                                log = message.value;
                                addLogToJson(
                                    log.title,
                                    log.description,
                                    log.hours,
                                    log.keystrokes,
                                    log.lines,
                                    log.links
                                );
                                checkLanguageMilestonesAchieved();
                                checkDaysMilestones();
                                currentPanel.dispose();
                                commands.executeCommand("DoC.viewLogs");
                            }
                            break;
                    }
                });

                currentPanel.onDidDispose(() => {
                    currentPanel = undefined;
                });
            }
        })
    );

    return Disposable.from(...cmds);
}
