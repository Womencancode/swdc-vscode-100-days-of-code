import { Disposable, commands, window, TreeView, ViewColumn } from "vscode";
import { TreeNode } from "../models/TreeNode";
import {
  Tree100DoCProvider,
  connectDoCTreeView,
} from "../tree/Tree100DoCProvider";
import { getLogsHtml, updateLogsHtml, addLogToJson } from "./LogsUtil";
import {
  updateMilestonesHtml,
  getMilestonesHtml,
  achievedMilestonesJson,
} from "./MilestonesUtil";
import { updateAddLogHtml, getAddLogHtml } from "./addLogUtil";
import { getDashboardHtml, updateDashboardHtml } from "./DashboardUtil";
const fs = require("fs");

export function createCommands(): { dispose: () => void } {
  let cmds: any[] = [];

  const Doc100SftwProvider = new Tree100DoCProvider();
  const Doc100SftwTreeView: TreeView<TreeNode> = window.createTreeView(
    "100DoC-tree",
    {
      treeDataProvider: Doc100SftwProvider,
      showCollapseAll: true,
    }
  );
  Doc100SftwProvider.bindView(Doc100SftwTreeView);
  cmds.push(connectDoCTreeView(Doc100SftwTreeView));

  cmds.push(
    commands.registerCommand("DoC.viewLogs", () => {
      updateLogsHtml();

      const panel = window.createWebviewPanel("Logs", "Logs", ViewColumn.One, {
        enableScripts: true,
      });
      const logsHtmlPath = getLogsHtml();
      fs.readFile(logsHtmlPath, "utf8", (err: Error, data: string) => {
        if (err) {
          console.log(err);
        }
        panel.webview.html = data;
      });
    })
  );

  cmds.push(
    commands.registerCommand("DoC.viewDashboard", () => {
      updateDashboardHtml();
      const panel = window.createWebviewPanel(
        "Dashboard",
        "Dashboard",
        ViewColumn.One,
        { enableScripts: true }
      );
      const dashboardHtmlPath = getDashboardHtml();
      fs.readFile(dashboardHtmlPath, "utf8", (err: Error, data: string) => {
        if (err) {
          console.log(err);
        }
        panel.webview.html = data;
        panel.webview.onDidReceiveMessage((message) => {
          switch (message.command) {
            case "Logs":
              panel.dispose();
              commands.executeCommand("DoC.viewLogs");
              break;
            case "Milestones":
              panel.dispose();
              commands.executeCommand("DoC.viewMilestones");
              break;
          }
        });
      });
    })
  );

  cmds.push(
    commands.registerCommand("DoC.viewMilestones", () => {
      updateMilestonesHtml();
      const panel = window.createWebviewPanel(
        "Milestones",
        "Milestones",
        ViewColumn.One,
        {}
      );
      const milestonesHtmlPath = getMilestonesHtml();
      fs.readFile(milestonesHtmlPath, "utf8", (err: Error, data: string) => {
        if (err) {
          console.log(err);
        }
        panel.webview.html = data;
      });
    })
  );

  cmds.push(
    commands.registerCommand("DoC.addLog", () => {
      // updateLogsMilestones([5,8,21]);
      updateAddLogHtml();
      const panel = window.createWebviewPanel(
        "Add Daily Progress Log",
        "Add Daily Progress Log",
        ViewColumn.One,
        { enableScripts: true }
      );
      const addLogHtmlPath = getAddLogHtml();
      fs.readFile(addLogHtmlPath, "utf8", (err: Error, data: string) => {
        if (err) {
          console.log(err);
        }
        panel.webview.html = data;

        // handle submit or cancel
        var log;
        panel.webview.onDidReceiveMessage((message) => {
          switch (message.command) {
            case "cancel":
              window.showErrorMessage("BYE");
              panel.dispose();
              return;

            case "log":
              log = message.value;
              addLogToJson(
                log.title,
                log.description,
                log.hours,
                log.keystrokes,
                log.lines,
                log.links
              );
              window.showInformationMessage(
                "Thank you for submitting the log. You can now view it in Logs section under 100 Days of Code."
              );
              panel.dispose();
              return;
          }
        });
      });
    })
  );

  return Disposable.from(...cmds);
}
