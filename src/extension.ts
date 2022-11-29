// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {activateMadeDebug} from './activateMadeDebug';
import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';

const runMode: 'external' | 'server' | 'inline' = 'external';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "made-for-vs-code" is now active!');
	// register a configuration provider for 'made' debug type

	activateMadeDebug(context);	
}

// this method is called when your extension is deactivated
export function deactivate() {}
