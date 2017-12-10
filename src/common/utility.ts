"use strict";
import * as asciitable from "asciitable";
import * as fs from "fs";
import * as mysql from "mysql";
import * as uuidv1 from "uuid/v1";
import * as vscode from "vscode";
import { IConnection } from "../model/connection";
import { ConnectionNode } from "../model/connectionNode";
import { MySQLTreeDataProvider } from "../mysqlTreeDataProvider";
import { AppInsightsClient } from "./appInsightsClient";
import { Constants } from "./constants";
import { Global } from "./global";
import { OutputChannel } from "./outputChannel";

export class Utility {
    public static readonly maxTableCount = Utility.getConfiguration().get<number>("maxTableCount");

    public static getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration("vscode-mysql");
    }

    public static queryPromise<T>(connection, sql: string): Promise<T> {
        return new Promise((resolve, reject) => {
            connection.query(sql, (err, rows) => {
                if (err) {
                    reject("Error: " + err.message);
                } else {
                    resolve(rows);
                }
            });
            connection.end();
        });
    }

    public static async runQuery(sql?: string, connectionOptions?: IConnection) {
        AppInsightsClient.sendEvent("runQuery.start");
        if (!sql && !vscode.window.activeTextEditor) {
            vscode.window.showWarningMessage("No SQL file selected");
            AppInsightsClient.sendEvent("runQuery.noFile");
            return;
        }
        if (!connectionOptions && !Global.activeConnection) {
            const hasActiveConnection = await Utility.hasActiveConnection();
            if (!hasActiveConnection) {
                vscode.window.showWarningMessage("No MySQL Server or Database selected");
                AppInsightsClient.sendEvent("runQuery.noMySQL");
                return;
            }
        }

        sql = sql ? sql : vscode.window.activeTextEditor.document.getText();
        connectionOptions = connectionOptions ? connectionOptions : Global.activeConnection;
        connectionOptions.multipleStatements = true;
        const connection = Utility.createConnection(connectionOptions);

        OutputChannel.appendLine("[Start] Executing MySQL query...");
        connection.query(sql, (err, rows) => {
            if (Array.isArray(rows)) {
                if (rows.some(((row) => Array.isArray(row)))) {
                    rows.forEach((row) => {
                        if (Array.isArray(row)) {
                            OutputChannel.appendLine(asciitable(row));
                        } else {
                            OutputChannel.appendLine(JSON.stringify(row));
                        }
                    });
                } else {
                    OutputChannel.appendLine(asciitable(rows));
                }
            } else {
                OutputChannel.appendLine(JSON.stringify(rows));
            }
            if (err) {
                OutputChannel.appendLine(err);
                AppInsightsClient.sendEvent("runQuery.end", { Result: "Fail", ErrorMessage: err });
            } else {
                AppInsightsClient.sendEvent("runQuery.end", { Result: "Success" });
            }
            OutputChannel.appendLine("[Done] Finished MySQL query.");
        });
        connection.end();
    }

    public static async createSQLTextDocument(sql: string = "") {
        const textDocument = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
        return vscode.window.showTextDocument(textDocument);
    }

    // TODO: Rename to createMySQLConnection
    public static createConnection(connectionOptions: IConnection): any {
        const newConnectionOptions: any = Object.assign({}, connectionOptions);
        if (connectionOptions.certPath && fs.existsSync(connectionOptions.certPath)) {
            newConnectionOptions.ssl = {
                ca: fs.readFileSync(connectionOptions.certPath),
            };
        }
        return mysql.createConnection(newConnectionOptions);
    }

    public static async editConnection(connectionNode: ConnectionNode, context: vscode.ExtensionContext, mysqlTreeDataProvider: MySQLTreeDataProvider) {
        if (connectionNode) {
            connectionNode.editConnection(context, mysqlTreeDataProvider);
        } else {
            const selectedConnection = await Utility.pickConnection(context);
            if (selectedConnection !== undefined) {
                const dummyNode = new ConnectionNode(selectedConnection.id, selectedConnection.host, selectedConnection.user, selectedConnection.password,
                                                selectedConnection.port, selectedConnection.certPath);

                dummyNode.editConnection(context, mysqlTreeDataProvider);
            }
        }
    }

    public static async deleteConnection(connectionNode: ConnectionNode, context: vscode.ExtensionContext, mysqlTreeDataProvider: MySQLTreeDataProvider) {
        if (connectionNode) {
            connectionNode.deleteConnection(context, mysqlTreeDataProvider);
        } else {
            const selectedConnection = await Utility.pickConnection(context);
            if (selectedConnection !== undefined) {
                const dummyNode = new ConnectionNode(selectedConnection.id, selectedConnection.host, selectedConnection.user, selectedConnection.password,
                                                selectedConnection.port, selectedConnection.certPath);

                dummyNode.deleteConnection(context, mysqlTreeDataProvider);
            }
        }
    }

    public static async createConnectionFromInput(context: vscode.ExtensionContext, copyFrom?: IConnection): Promise<IConnection> {
        const host = await vscode.window.showInputBox({ prompt: "The hostname of the database", placeHolder: "host", ignoreFocusOut: true, value: copyFrom !== undefined ? copyFrom.host : ""});
        if (!host) {
            return;
        }

        const user = await vscode.window.showInputBox({ prompt: "The MySQL user to authenticate as", placeHolder: "user", ignoreFocusOut: true, value: copyFrom !== undefined ? copyFrom.user : "" });
        if (!user) {
            return;
        }

        const pw = copyFrom !== undefined ? await Global.keytar.getPassword(Constants.ExtensionId, copyFrom.id) : "";
        const password = await vscode.window.showInputBox({ prompt: "The password of the MySQL user", placeHolder: "password",
                                                            ignoreFocusOut: true, password: true,
                                                            value: pw });
        if (password === undefined) {
            return;
        }

        const port = await vscode.window.showInputBox({ prompt: "The port number to connect to", placeHolder: "port", ignoreFocusOut: true, value: copyFrom !== undefined ? copyFrom.port : "" });
        if (!port) {
            return;
        }

        const certPath = await vscode.window.showInputBox({ prompt: "[Optional] SSL certificate path. Leave empty to ignore", placeHolder: "certificate file path", ignoreFocusOut: true,
                                                            value: copyFrom !== undefined ? copyFrom.certPath : "" });
        if (certPath === undefined) {
            return;
        }

        const connection: IConnection = {
            host,
            user,
            password,
            port,
            certPath,
        };

        const id = copyFrom ? copyFrom.id : uuidv1();
        connection.id = id;

        return connection;
    }

    private static async hasActiveConnection(): Promise<boolean> {
        let count = 5;
        while (!Global.activeConnection && count > 0) {
            await Utility.sleep(100);
            count--;
        }
        return !!Global.activeConnection;
    }

    private static sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    private static async pickConnection(context: vscode.ExtensionContext): Promise<IConnection> {
        let selectedConnection;

        const connections = context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);
        const items: vscode.QuickPickItem[] = [];

        if (connections) {
            for (const id of Object.keys(connections)) {
                const item = connections[id];
                items.push({
                  label: item.host,
                  description: item.user});
            }
        }

        await vscode.window.showQuickPick(items).then(async (selection) => {
            // the user canceled the selection
            if (!selection) {
                return selectedConnection;
            }

            const selectedConnectionId = Object.keys(connections)[items.indexOf(selection)];
            selectedConnection = connections[selectedConnectionId];
            selectedConnection.id = selectedConnectionId;
        });
        return selectedConnection;
    }
}
