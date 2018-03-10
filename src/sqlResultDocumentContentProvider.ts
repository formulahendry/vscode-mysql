import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';
import * as mysql from "mysql";
import { IConnection } from "./model/connection";
import { Global } from "./common/global";

export class SqlResultDocumentContentProvider implements TextDocumentContentProvider {
	private _context: ExtensionContext;

	constructor(context: ExtensionContext) {
		this._context = context;
	}

	public provideTextDocumentContent(uri: Uri): Thenable<string> {

		let self = this;
		return new Promise((resolve,reject) => {
			const head = [].concat(
				'<!DOCTYPE html>',
				'<html>',
				'<head>',
				'<meta http-equiv="Content-type" content="text/html;charset=UTF-8">',
				'<style>table{border-collapse:collapse; }table,td,th{border:1px dotted #ccc; padding:5px;}th {background:#444} </style>',
				'</head>',
				'<body>'
			).join('\n');

			const body = self._render(JSON.parse(uri.query));

			const tail = [
				'</body>',
				'</html>'
			].join('\n');

			resolve(head + body + tail);
		});
	}

	private _render(rows){
		if(rows.length==0) return 'No data';
		let head = '';
		for(let field in rows[0]) {
			head += '<th>' + field + '</th>';
		}
		let body = '<table><tr>' + head + '</tr>';
		rows.forEach( (row)=> {
			body += '<tr>';
			for(let field in row) {
				body += '<td>' + row[field] + '</td>';
			}

			body += '</tr>';
		});

		return body + '</table>';
	}

}