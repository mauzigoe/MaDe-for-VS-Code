'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import {matlabDebugType} from './madeInfo';
import { MatlabDebugSession } from './madeDebug';
import { stringify } from 'querystring';

export function activateMadeDebug(context: vscode.ExtensionContext) {
		
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.matlabDebug.runEditorContents', (resource: vscode.Uri) => {
			let targetResource = resource;
			if (!targetResource && vscode.window.activeTextEditor) {
				targetResource = vscode.window.activeTextEditor.document.uri;
			}
			if (targetResource) {
				vscode.debug.startDebugging(undefined, {
					type: matlabDebugType,
					name: 'Run File',
					request: 'launch',
					program: targetResource.fsPath
				},
					{ noDebug: true }
				);
			}
		}),
		vscode.commands.registerCommand('extension.matlabDebug.debugEditorContents', (resource: vscode.Uri) => {
			console.log("extension.matlabDebug.debugEditorContents");
			let targetResource = resource;
			if (!targetResource && vscode.window.activeTextEditor) {
				targetResource = vscode.window.activeTextEditor.document.uri;
			}
			if (targetResource) {
				vscode.debug.startDebugging(undefined, {
					type: matlabDebugType,
					name: 'Debug File',
					request: 'launch',
					program: targetResource.fsPath,
					stopOnEntry: true
				});
			}
		}),
	);

    context.subscriptions.push(vscode.commands.registerCommand('extension.matlabDebug.getProgramName', config => {
		return vscode.window.showInputBox({
			placeHolder: "Please enter the name of a matlab file in the workspace folder",
		});
	}));

	const provider = new MadeConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(matlabDebugType, provider));

	let factory = new InlineDebugAdapterFactory();
	
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory(matlabDebugType, factory));

}

class MadeConfigurationProvider implements vscode.DebugConfigurationProvider {


	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				config.type = matlabDebugType;
				config.name = 'Launch';
				config.request = 'launch';
				config.program = `${editor.document.fileName}`;
				config.stopOnEntry = true;
			}
		}

		if (!config.program) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		return config;
	}
}


class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		let matlabExecutablePath = vscode.workspace.getConfiguration().get<string>('matlabExecutablePath');
		let licensePath = vscode.workspace.getConfiguration().get<string>('licensePath');
		return new vscode.DebugAdapterInlineImplementation(new MatlabDebugSession(matlabExecutablePath, licensePath));
	}
}

