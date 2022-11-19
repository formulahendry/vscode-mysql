import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Global } from "../common/global";
import { OutputChannel } from "../common/outputChannel";
import { Utility } from "../common/utility";
import { ColumnNode } from "./columnNode";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";

export class TableNode implements INode {
    constructor(private readonly host: string, private readonly user: string, private readonly password: string,
                private readonly port: string, private readonly database: string, private readonly table: string,
                private readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.table,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: "table",
            iconPath: path.join(__filename, "..", "..", "..", "resources", "table.svg"),
        };
    }

    public async getChildren(): Promise<INode[]> {
        const connection = Utility.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
            certPath: this.certPath,
        });

        return Utility.queryPromise<any[]>(connection, `SELECT * FROM information_schema.columns WHERE table_schema = '${this.database}' AND table_name = '${this.table}';`)
            .then((columns) => {
                return columns.map<ColumnNode>((column) => {
                    return new ColumnNode(this.host, this.user, this.password, this.port, this.database, column );
                });
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async selectTop1000() {
        AppInsightsClient.sendEvent("selectTop1000");
        const sql = `SELECT * FROM \`${this.database}\`.\`${this.table}\` LIMIT 1000;`;
        Utility.createSQLTextDocument(sql);

        const connection = {
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
            certPath: this.certPath,
        };
        Global.activeConnection = connection;

        Utility.runQuery(sql, connection);
    }
    
    public async customLimitWithSort() {
        AppInsightsClient.sendEvent("customLimitWithSort");
        const limit = await vscode.window.showInputBox({ prompt: "Custom value to select from table", placeHolder: "Limit", ignoreFocusOut: true });
        const sort = await vscode.window.showInputBox({ prompt: "Order by field for sorting in DESC", placeHolder: "created_at", ignoreFocusOut: true });

        if (!limit && !sort)
            return;

        if (Number.isNaN(limit)) {
            vscode.window.showErrorMessage('Invalid value passed for selection - should be a number');
            return;
        }
                
        const sql = `SELECT * FROM \`${this.database}\`.\`${this.table}\` ORDER BY ${sort} DESC LIMIT ${limit};`;
        Utility.createSQLTextDocument(sql);

        const connection = {
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
            certPath: this.certPath,
        };
        Global.activeConnection = connection;

        Utility.runQuery(sql, connection);
    }
}
