'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import {matlabType, matlabDebugType} from './madeInfo';
import { MatlabDebugSession } from './madeDebug';

export function activateMadeDebug(context: vscode.ExtensionContext, factory?: vscode.DebugAdapterDescriptorFactory) {
    console.log("activateMadeDebug");
	// register a configuration provider for 'matlab' debug type
		
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
		vscode.commands.registerCommand('extension.matlabDebug.toggleFormatting', (variable) => {
			const ds = vscode.debug.activeDebugSession;
			if (ds) {
				ds.customRequest('toggleFormatting');
			}
		})
	);

    context.subscriptions.push(vscode.commands.registerCommand('extension.matlabDebug.getProgramName', config => {
		return vscode.window.showInputBox({
			placeHolder: "Please enter the name of a matlab file in the workspace folder",
		});
	}));

	const provider = new MadeConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(matlabDebugType, provider));
	
	if (!factory) {
		factory = new InlineDebugAdapterFactory();
	}
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory(matlabDebugType, factory));

	// override VS Code's default implementation of the debug hover
	// here we match only Mock "variables", that are words starting with an '$'
	/*
	context.subscriptions.push(vscode.languages.registerEvaluatableExpressionProvider(...) -> siehe activateMockDebug 
	*/

	// override VS Code's default implementation of the "inline values" feature"
	// context.subscriptions.push(vscode.languages.registerInlineValuesProvider() -> siehe activateMockDebug 
	
}

class MadeConfigurationProvider implements vscode.DebugConfigurationProvider {


	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === matlabType) {
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
		return new vscode.DebugAdapterInlineImplementation(new MatlabDebugSession());
	}
}

