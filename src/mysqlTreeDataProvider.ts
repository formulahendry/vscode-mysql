import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "./common/appInsightsClient";
import { Constants } from "./common/constants";
import { Global } from "./common/global";
import { Utility } from "./common/utility";
import { IConnection } from "./model/connection";
import { ConnectionNode } from "./model/connectionNode";
import { INode } from "./model/INode";

export class MySQLTreeDataProvider implements vscode.TreeDataProvider<INode> {
    public _onDidChangeTreeData: vscode.EventEmitter<INode> = new vscode.EventEmitter<INode>();
    public readonly onDidChangeTreeData: vscode.Event<INode> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {
    }

    public getTreeItem(element: INode): Promise<vscode.TreeItem> | vscode.TreeItem {
        return element.getTreeItem();
    }

    public getChildren(element?: INode): Thenable<INode[]> | INode[] {
        if (!element) {
            return this.getConnectionNodes();
        }

        return element.getChildren();
    }

    public async addConnection() {
        AppInsightsClient.sendEvent("addConnection.start");

        const newConnection = await Utility.createConnectionFromInput(this.context);

        if (newConnection !== undefined) {
            let connections = await this.context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);

            if (!connections) {
                connections = {};
            }

            connections[newConnection.id] = newConnection;

            if (newConnection.password) {
                await Global.keytar.setPassword(Constants.ExtensionId, newConnection.id, newConnection.password);
            }
            await this.context.globalState.update(Constants.GlobalStateMySQLConectionsKey, connections);
            this.refresh();
        }
        AppInsightsClient.sendEvent("addConnection.end");
    }

    public refresh(element?: INode): void {
        this._onDidChangeTreeData.fire(element);
    }

    private async getConnectionNodes(): Promise<ConnectionNode[]> {
        const connections = this.context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);
        const ConnectionNodes = [];
        if (connections) {
            for (const id of Object.keys(connections)) {
                const password = await Global.keytar.getPassword(Constants.ExtensionId, id);
                ConnectionNodes.push(new ConnectionNode(id, connections[id].host, connections[id].user, password, connections[id].port, connections[id].certPath));
                if (!Global.activeConnection) {
                    Global.activeConnection = {
                        host: connections[id].host,
                        user: connections[id].user,
                        password,
                        port: connections[id].port,
                        certPath: connections[id].certPath,
                    };
                }
            }
        }
        return ConnectionNodes;
    }
}
