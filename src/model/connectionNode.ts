import * as fs from "fs";
import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Constants } from "../common/constants";
import { Global } from "../common/global";
import { Utility } from "../common/utility";
import { MySQLTreeDataProvider } from "../mysqlTreeDataProvider";
import { IConnection } from "./connection";
import { DatabaseNode } from "./databaseNode";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";

export class ConnectionNode implements INode {
    constructor(private readonly id: string, private readonly host: string, private readonly user: string,
                private readonly password: string, private readonly port: string,
                private readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.host,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: "connection",
            iconPath: path.join(__filename, "..", "..", "..", "resources", "server.png"),
        };
    }

    public async getChildren(): Promise<INode[]> {
        const connection = Utility.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            certPath: this.certPath,
        });

        return Utility.queryPromise<any[]>(connection, "SHOW DATABASES")
            .then((databases) => {
                return databases.map<DatabaseNode>((database) => {
                    return new DatabaseNode(this.host, this.user, this.password, this.port, database.Database, this.certPath);
                });
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async newQuery() {
        AppInsightsClient.sendEvent("newQuery", { viewItem: "connection" });
        Utility.createSQLTextDocument();

        Global.activeConnection = {
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            certPath: this.certPath,
        };
    }

    public async deleteConnection(context: vscode.ExtensionContext, mysqlTreeDataProvider: MySQLTreeDataProvider) {
        const options: vscode.MessageOptions = {
            modal: true,
        };
        const answer = await vscode.window.showWarningMessage(`Are you sure you want to delete ${this.host}?`, options, "Delete connection");

        if (answer === undefined) {
            return;
        }

        AppInsightsClient.sendEvent("deleteConnection");
        const connections = context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);
        delete connections[this.id];
        await context.globalState.update(Constants.GlobalStateMySQLConectionsKey, connections);

        await Global.keytar.deletePassword(Constants.ExtensionId, this.id);

        mysqlTreeDataProvider.refresh();
    }

    public async editConnection(context?: vscode.ExtensionContext, mysqlTreeDataProvider?: MySQLTreeDataProvider) {
        AppInsightsClient.sendEvent("editConncetion");

        const host = await vscode.window.showInputBox({ prompt: "The hostname of the database", placeHolder: "host", ignoreFocusOut: true, value: this.host });
        if (!host) {
            return;
        }

        const user = await vscode.window.showInputBox({ prompt: "The MySQL user to authenticate as", placeHolder: "user", ignoreFocusOut: true, value: this.user });
        if (!user) {
            return;
        }

        const password = await vscode.window.showInputBox({ prompt: "The password of the MySQL user", placeHolder: "password",
                                                            ignoreFocusOut: true, password: true, value: await Global.keytar.getPassword(Constants.ExtensionId, this.id) });
        if (password === undefined) {
            return;
        }

        const port = await vscode.window.showInputBox({ prompt: "The port number to connect to", placeHolder: "port", ignoreFocusOut: true, value: this.port });
        if (!port) {
            return;
        }

        const certPath = await vscode.window.showInputBox({ prompt: "[Optional] SSL certificate path. Leave empty to ignore", placeHolder: "certificate file path", ignoreFocusOut: true,
                                                            value: this.certPath });
        if (certPath === undefined) {
            return;
        }

        let connections = await context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);

        if (!connections) {
            connections = {};
        }

        connections[this.id] = {
            host,
            user,
            port,
            certPath,
        };

        if (password) {
            await Global.keytar.setPassword(Constants.ExtensionId, this.id, password);
        }
        await context.globalState.update(Constants.GlobalStateMySQLConectionsKey, connections);
        mysqlTreeDataProvider.refresh();

        return true;
    }
}
